import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// process.cwd() is always the directory where `next start`/`next dev` was
// invoked — i.e. the `dashboard/` folder — regardless of where the compiled
// bundle ends up inside .next/server/. Using __dirname / import.meta.url would
// resolve to the wrong path in a production build.
const DASHBOARD_ROOT = process.cwd();
const PROJECT_ROOT = path.resolve(DASHBOARD_ROOT, "../");
const ENV_FILE_CANDIDATES = [
  path.join(DASHBOARD_ROOT, ".env.local"),
  path.join(DASHBOARD_ROOT, ".env"),
  path.join(PROJECT_ROOT, ".env"),
];

let envFileCache = null;
const SESSION_COOKIE_NAME = "dashboard_session_token";

function stripQuotes(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function parseEnvFile(content) {
  const parsed = {};
  const lines = String(content ?? "").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key) continue;
    const value = stripQuotes(line.slice(eq + 1));
    parsed[key] = value;
  }
  return parsed;
}

function readFallbackEnvFiles() {
  if (envFileCache) return envFileCache;
  const values = {};
  for (const filePath of ENV_FILE_CANDIDATES) {
    try {
      if (!fs.existsSync(filePath)) continue;
      Object.assign(values, parseEnvFile(fs.readFileSync(filePath, "utf8")));
    } catch {
      // best-effort fallback env loading
    }
  }
  envFileCache = values;
  return values;
}

function getEnvValue(name, fallback = "") {
  const runtime = String(process.env?.[name] ?? "").trim();
  if (runtime) return runtime;

  const fromFiles = String(readFallbackEnvFiles()?.[name] ?? "").trim();
  if (fromFiles) return fromFiles;

  return String(fallback ?? "").trim();
}

function getProxyConfig() {
  const apiBase = getEnvValue(
    "DASHBOARD_API_BASE",
    getEnvValue("NEXT_PUBLIC_DASHBOARD_API", "http://localhost:3100"),
  );
  const apiKey = getEnvValue("DASHBOARD_API_KEY", "");
  return { apiBase, apiKey };
}

function buildRoutePath(params) {
  const path = Array.isArray(params?.path) ? params.path.join("/") : "";
  return path ? `/api/${path}` : "/api";
}

function parseCookies(cookieHeader) {
  const out = {};
  const raw = String(cookieHeader ?? "");
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.split("=");
    const key = String(k ?? "").trim();
    if (!key) continue;
    out[key] = decodeURIComponent(rest.join("=").trim());
  }
  return out;
}

function getSessionTokenFromCookie(req) {
  const cookies = parseCookies(req.headers.get("cookie"));
  return String(cookies[SESSION_COOKIE_NAME] ?? "").trim();
}

function isSecureRequest(req) {
  const forwardedProto = String(req.headers.get("x-forwarded-proto") ?? "")
    .toLowerCase()
    .trim();
  if (forwardedProto === "https") return true;
  return process.env.NODE_ENV === "production";
}

function buildSessionCookie(token, maxAgeSec, secure) {
  const attrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.max(0, Number(maxAgeSec) || 0)}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

function buildClearSessionCookie(secure) {
  const attrs = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

function buildUpstreamUrl(req, params, apiBase) {
  const path = Array.isArray(params?.path) ? params.path.join("/") : "";
  const url = new URL(req.url);
  const upstreamPath = path ? `/api/${path}` : "/api";
  const upstream = new URL(upstreamPath, apiBase);
  upstream.search = url.search;
  return upstream;
}

async function proxyRequest(req, params) {
  const { apiBase, apiKey } = getProxyConfig();
  const routePath = buildRoutePath(params);
  const secure = isSecureRequest(req);

  if (!apiKey) {
    return new Response(
      JSON.stringify({ ok: false, error: "missing_api_key" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (req.method === "POST" && routePath === "/api/auth/logout") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Set-Cookie": buildClearSessionCookie(secure),
      },
    });
  }

  const upstreamUrl = buildUpstreamUrl(req, params, apiBase);
  const headers = new Headers();
  headers.set("X-API-Key", apiKey);
  const sessionToken = getSessionTokenFromCookie(req);

  const auth =
    req.headers.get("authorization") ||
    (sessionToken ? `Bearer ${sessionToken}` : "");
  if (auth) headers.set("Authorization", auth);
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("X-Forwarded-For", forwardedFor);
  const realIp = req.headers.get("x-real-ip");
  if (realIp) headers.set("X-Real-IP", realIp);
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : await req.text();

  const upstream = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body,
    cache: "no-store",
  });

  const responseBody = await upstream.text();
  const responseHeaders = new Headers();
  const upstreamType = upstream.headers.get("content-type");
  if (upstreamType) responseHeaders.set("Content-Type", upstreamType);
  responseHeaders.set("Cache-Control", "no-store");

  if (req.method === "POST" && routePath === "/api/auth/login") {
    let data = {};
    try {
      data = responseBody ? JSON.parse(responseBody) : {};
    } catch {
      data = {};
    }
    if (upstream.ok && data?.ok && data?.token) {
      const expiresAt = Number(data?.expiresAt ?? 0) || 0;
      const maxAgeSec = expiresAt
        ? Math.max(60, Math.floor((expiresAt - Date.now()) / 1000))
        : 12 * 60 * 60;
      responseHeaders.set(
        "Set-Cookie",
        buildSessionCookie(String(data.token), maxAgeSec, secure),
      );
      return new Response(
        JSON.stringify({ ok: true, expiresAt: data?.expiresAt ?? null }),
        {
          status: upstream.status,
          headers: responseHeaders,
        },
      );
    }
    responseHeaders.set("Set-Cookie", buildClearSessionCookie(secure));
  }

  return new Response(responseBody, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(req, context) {
  return proxyRequest(req, context.params);
}

export async function POST(req, context) {
  return proxyRequest(req, context.params);
}

export async function PUT(req, context) {
  return proxyRequest(req, context.params);
}

export async function DELETE(req, context) {
  return proxyRequest(req, context.params);
}
