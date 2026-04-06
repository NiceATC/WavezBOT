const API_BASE = process.env.DASHBOARD_API_BASE || "http://localhost:3100";
const API_KEY = process.env.DASHBOARD_API_KEY || "";

function buildUpstreamUrl(req, params) {
  const path = Array.isArray(params?.path) ? params.path.join("/") : "";
  const url = new URL(req.url);
  const upstreamPath = path ? `/api/${path}` : "/api";
  const upstream = new URL(upstreamPath, API_BASE);
  upstream.search = url.search;
  return upstream;
}

async function proxyRequest(req, params) {
  if (!API_KEY) {
    return new Response(
      JSON.stringify({ ok: false, error: "missing_api_key" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const upstreamUrl = buildUpstreamUrl(req, params);
  const headers = new Headers();
  headers.set("X-API-Key", API_KEY);

  const auth = req.headers.get("authorization");
  if (auth) headers.set("Authorization", auth);
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
  });

  const responseBody = await upstream.text();
  const responseHeaders = new Headers();
  const upstreamType = upstream.headers.get("content-type");
  if (upstreamType) responseHeaders.set("Content-Type", upstreamType);
  responseHeaders.set("Cache-Control", "no-store");

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
