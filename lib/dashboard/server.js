import http from "http";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { URL } from "url";
import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import si from "systeminformation";
import { BOT_VERSION } from "../version.js";
import { listJsFilesRecursive } from "../../helpers/fs.js";
import { ensureMention } from "../../helpers/chat.js";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  getLocaleData,
  getLocaleFilePath,
  invalidateLocaleCache,
  normalizeLocale,
  resolveLocalizedValue,
  t as translate,
} from "../i18n.js";
import {
  initStorage,
  listDbTables,
  listDbDatabases,
  getDbTableColumns,
  getDbTableRows,
  updateDbTableRow,
  deleteDbTableRow,
  executeDbSql,
  clearWarnings,
  deleteWarningById,
  listUsersForModeration,
  listWarningsForModeration,
  listEconomyTop,
  listXpTop,
  listTopWootUsers,
  listTopChatUsers,
  listTopCasinoWinners,
  listTopCasinoLosers,
  listTopDjUsers,
  listTopSongs,
  getOverviewStats,
  setSetting,
} from "../storage.js";
import { loadConfig, reloadConfigSource } from "../config.js";
import { issueWarning } from "../../helpers/warnings.js";
import { RUNTIME_SETTING_KEYS, parseSettingValue } from "../settings.js";

const DEFAULT_PORT = 3100;
const DEFAULT_TOKEN_TTL_MIN = 12 * 60;
const DEFAULT_LOG_BUFFER = 500;
const DEFAULT_BIND = "127.0.0.1";
const WS_TOKEN_TTL_MIN = 5;

const ROOT = process.cwd();
const COMMANDS_DIR = path.join(ROOT, "commands");
const EVENTS_DIR = path.join(ROOT, "events");
const CONFIG_DIR = path.join(ROOT, "config");
const CONFIG_PATH = path.join(ROOT, "config.json");

const EDITABLE_CONFIG_KEYS = new Set([
  ...RUNTIME_SETTING_KEYS,
  "autowootUrl",
  "dashboardTheme",
  "room",
  "roomUrl",
]);
const RESTART_REQUIRED_KEYS = new Set(["room"]);

const diskIoRateState = {
  at: 0,
  read: 0,
  write: 0,
  initialized: false,
};

function parseOrigins(raw) {
  const value = String(raw ?? "").trim();
  if (!value) {
    return {
      allowAll: false,
      origins: new Set(["http://localhost:3000", "http://127.0.0.1:3000"]),
    };
  }
  if (value === "*") {
    return { allowAll: true, origins: new Set() };
  }
  const origins = new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  return { allowAll: false, origins };
}

function isValidLocaleTree(value, depth = 0) {
  if (depth > 40) return false;
  if (value == null) return true;
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") {
    return true;
  }
  if (Array.isArray(value)) {
    if (value.length > 10_000) return false;
    for (const item of value) {
      if (!isValidLocaleTree(item, depth + 1)) return false;
    }
    return true;
  }
  if (type === "object") {
    const entries = Object.entries(value);
    if (entries.length > 10_000) return false;
    for (const [k, v] of entries) {
      if (typeof k !== "string" || k.length > 256) return false;
      if (!isValidLocaleTree(v, depth + 1)) return false;
    }
    return true;
  }
  return false;
}

function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data ?? {});
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function sendError(res, status, error, message) {
  sendJson(res, status, { ok: false, error, message });
}

async function readJson(req, maxBytes = 1_000_000) {
  let size = 0;
  let raw = "";
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new Error("Body too large");
    }
    raw += chunk.toString("utf8");
  }
  if (!raw) return {};
  return JSON.parse(raw);
}

function readConfigFile() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeConfigFile(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 4));
}

function resolveSafePath(baseDir, relativePath, options = {}) {
  const allowedExtensions = Array.isArray(options.allowedExtensions)
    ? options.allowedExtensions
    : [".js"];
  const blockIndexJs = options.blockIndexJs !== false;

  if (!relativePath || typeof relativePath !== "string") {
    throw new Error("Invalid path");
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error("Invalid path");
  }
  if (blockIndexJs && relativePath.replace(/\\/g, "/") === "index.js") {
    throw new Error("Restricted path");
  }

  const ext = path.extname(relativePath).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    throw new Error(`Only ${allowedExtensions.join(", ")} files are allowed`);
  }

  const safeBase = path.resolve(baseDir);
  const safePath = path.resolve(safeBase, relativePath);
  const safeBaseReal = fs.realpathSync.native(safeBase);
  let existingAnchor = safePath;
  while (!fs.existsSync(existingAnchor)) {
    const parent = path.dirname(existingAnchor);
    if (parent === existingAnchor) break;
    existingAnchor = parent;
  }

  const anchorReal = fs.realpathSync.native(existingAnchor);
  const targetReal = fs.existsSync(safePath)
    ? fs.realpathSync.native(safePath)
    : path.resolve(anchorReal, path.relative(existingAnchor, safePath));
  const rel = path.relative(safeBaseReal, targetReal);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Invalid path");
  }
  return safePath;
}

function listFiles(baseDir) {
  const files = listJsFilesRecursive(baseDir, new Set());
  return files
    .map((file) => path.relative(baseDir, file).split(path.sep).join("/"))
    .filter((file) => file !== "index.js")
    .sort();
}

function listConfigFiles(baseDir) {
  const out = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (path.extname(entry.name).toLowerCase() !== ".json") continue;
      out.push(path.relative(baseDir, full).split(path.sep).join("/"));
    }
  }

  walk(baseDir);
  return out.sort();
}

function getFileTypeConfig(type) {
  if (type === "commands") {
    return {
      baseDir: COMMANDS_DIR,
      allowedExtensions: [".js"],
      listFiles: () => listFiles(COMMANDS_DIR),
      blockIndexJs: true,
    };
  }

  if (type === "events") {
    return {
      baseDir: EVENTS_DIR,
      allowedExtensions: [".js"],
      listFiles: () => listFiles(EVENTS_DIR),
      blockIndexJs: true,
    };
  }

  if (type === "config") {
    return {
      baseDir: CONFIG_DIR,
      allowedExtensions: [".json"],
      listFiles: () => listConfigFiles(CONFIG_DIR),
      blockIndexJs: false,
    };
  }

  return null;
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ""));
  const bufB = Buffer.from(String(b ?? ""));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function getBearerToken(req) {
  const header = String(req.headers.authorization ?? "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

function getApiKey(req) {
  const header = req.headers["x-api-key"];
  return String(header ?? "").trim();
}

function parseTrustedProxies(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return new Set();
  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

const _trustedProxies = parseTrustedProxies(
  process.env.DASHBOARD_TRUSTED_PROXY,
);

function isTrustedProxy(addr) {
  if (!addr) return false;
  // strip IPv6-mapped IPv4 prefix (::ffff:1.2.3.4)
  const normalized = addr.replace(/^::ffff:/, "");
  return _trustedProxies.has(normalized) || _trustedProxies.has(addr);
}

function getClientIp(req) {
  const remoteAddr = String(req.socket?.remoteAddress ?? "").trim();
  if (isTrustedProxy(remoteAddr)) {
    const xff = String(req.headers["x-forwarded-for"] ?? "").trim();
    if (xff) {
      const first = xff.split(",")[0]?.trim();
      if (first) return first;
    }
    const realIp = String(req.headers["x-real-ip"] ?? "").trim();
    if (realIp) return realIp;
  }
  return remoteAddr || "unknown";
}

function toBool(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function buildCommandText(cmd, locale, keyField, textField) {
  const fallback = resolveLocalizedValue(cmd?.[textField], locale) ?? "";
  if (!cmd?.[keyField]) return String(fallback ?? "");
  const translated = translate(cmd[keyField], null, locale);
  if (translated && translated !== cmd[keyField]) return translated;
  return String(fallback ?? "");
}

function buildEventText(def, locale) {
  const fallback = resolveLocalizedValue(def?.description, locale) ?? "";
  if (!def?.descriptionKey) return String(fallback ?? "");
  const translated = translate(def.descriptionKey, null, locale);
  if (translated && translated !== def.descriptionKey) return translated;
  return String(fallback ?? "");
}

function sanitizeConfig(cfg, dashboardPublicUrl, dashboardEnabled) {
  return {
    room: cfg.room,
    roomUrl: cfg.roomUrl ?? "",
    autowootUrl: cfg.autowootUrl ?? "",
    dashboardTheme: cfg.dashboardTheme ?? {},
    locale: cfg.locale,
    cmdPrefix: cfg.cmdPrefix,
    autoWoot: cfg.autoWoot,
    economyEnabled: cfg.economyEnabled,
    xpEnabled: cfg.xpEnabled,
    blacklistEnabled: cfg.blacklistEnabled,
    greetEnabled: cfg.greetEnabled,
    dashboardPublicUrl: dashboardPublicUrl ?? "",
    dashboardEnabled: Boolean(dashboardEnabled),
  };
}

function stripAnsi(input) {
  return String(input ?? "").replace(
    /[\u001B\u009B][[\]()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><]/g,
    "",
  );
}

function installRuntimeLogCapture(pushLog) {
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  const shouldSkip = (message) => {
    const msg = String(message ?? "").trim();
    if (!msg) return true;
    // bot._log already pushes to dashboard via sink; skip its terminal mirror.
    if (
      /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]\s\[[A-Z\s]{4,5}\]/.test(msg)
    ) {
      return true;
    }
    return false;
  };

  const forward = (level, args) => {
    const text = stripAnsi(
      args
        .map((arg) => {
          if (typeof arg === "string") return arg;
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        })
        .join(" "),
    );

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);

    for (const line of lines) {
      if (shouldSkip(line)) continue;
      const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
      pushLog({
        level,
        source: "runtime",
        message: line,
        timestamp: ts,
      });
    }
  };

  console.log = (...args) => {
    original.log(...args);
    forward("log", args);
  };
  console.info = (...args) => {
    original.info(...args);
    forward("info", args);
  };
  console.warn = (...args) => {
    original.warn(...args);
    forward("warn", args);
  };
  console.error = (...args) => {
    original.error(...args);
    forward("error", args);
  };
  console.debug = (...args) => {
    original.debug(...args);
    forward("debug", args);
  };

  const onWarning = (warning) => {
    const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
    pushLog({
      level: "warn",
      source: "runtime",
      message: stripAnsi(
        String(warning?.stack || warning?.message || warning || ""),
      ),
      timestamp: ts,
    });
  };
  process.on("warning", onWarning);

  return () => {
    console.log = original.log;
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
    console.debug = original.debug;
    process.off("warning", onWarning);
  };
}

async function getSystemStats() {
  const [load, mem, fsSizes, fsIo, disksIo, netStats, latency] =
    await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.fsStats().catch(() => null),
      si.disksIO().catch(() => null),
      si.networkStats(),
      si.inetLatency(),
    ]);

  const diskTotals = fsSizes.reduce(
    (acc, item) => {
      acc.total += Number(item.size) || 0;
      acc.used += Number(item.used) || 0;
      return acc;
    },
    { total: 0, used: 0 },
  );

  const networkTotals = netStats.reduce(
    (acc, item) => {
      acc.rxSec += Number(item.rx_sec) || 0;
      acc.txSec += Number(item.tx_sec) || 0;
      return acc;
    },
    { rxSec: 0, txSec: 0 },
  );

  const cpuLoad = Math.round((Number(load.currentLoad) || 0) * 10) / 10;
  const memUsedRaw = Number(mem.used) || 0;
  const memActive = Number(mem.active) || 0;
  const memBuffCache = Number(mem.buffcache) || 0;
  const linuxEffectiveUsed = memBuffCache > 0 ? memUsedRaw - memBuffCache : 0;
  const memUsed =
    process.platform === "linux"
      ? Math.max(0, memActive || linuxEffectiveUsed || memUsedRaw)
      : memUsedRaw;
  const memTotal = Number(mem.total) || 0;
  const memPct = memTotal ? Math.round((memUsed / memTotal) * 100) : 0;
  const diskUsed = diskTotals.used;
  const diskTotal = diskTotals.total;
  const diskPct = diskTotal ? Math.round((diskUsed / diskTotal) * 100) : 0;
  const directDiskReadSec =
    Number(
      fsIo?.rx_sec ??
        fsIo?.read_sec ??
        disksIo?.rIO_sec ??
        disksIo?.read_sec ??
        0,
    ) || 0;
  const directDiskWriteSec =
    Number(
      fsIo?.wx_sec ??
        fsIo?.write_sec ??
        disksIo?.wIO_sec ??
        disksIo?.write_sec ??
        0,
    ) || 0;

  const cumulativeRead =
    Number(
      fsIo?.rx ??
        fsIo?.read_bytes ??
        fsIo?.readBytes ??
        disksIo?.rIO ??
        disksIo?.read_bytes ??
        disksIo?.readBytes ??
        0,
    ) || 0;
  const cumulativeWrite =
    Number(
      fsIo?.wx ??
        fsIo?.write_bytes ??
        fsIo?.writeBytes ??
        disksIo?.wIO ??
        disksIo?.write_bytes ??
        disksIo?.writeBytes ??
        0,
    ) || 0;

  let diskReadSec = directDiskReadSec;
  let diskWriteSec = directDiskWriteSec;

  const nowMs = Date.now();
  if (
    diskIoRateState.initialized &&
    nowMs > diskIoRateState.at &&
    (diskReadSec <= 0 || diskWriteSec <= 0)
  ) {
    const elapsedSec = (nowMs - diskIoRateState.at) / 1000;
    if (elapsedSec > 0) {
      if (diskReadSec <= 0 && cumulativeRead >= diskIoRateState.read) {
        diskReadSec = (cumulativeRead - diskIoRateState.read) / elapsedSec;
      }
      if (diskWriteSec <= 0 && cumulativeWrite >= diskIoRateState.write) {
        diskWriteSec = (cumulativeWrite - diskIoRateState.write) / elapsedSec;
      }
    }
  }

  diskIoRateState.at = nowMs;
  diskIoRateState.read = cumulativeRead;
  diskIoRateState.write = cumulativeWrite;
  diskIoRateState.initialized = true;

  return {
    cpu: { loadPct: cpuLoad },
    memory: { used: memUsed, total: memTotal, usedPct: memPct },
    disk: {
      used: diskUsed,
      total: diskTotal,
      usedPct: diskPct,
      readSec: diskReadSec,
      writeSec: diskWriteSec,
    },
    network: { rxSec: networkTotals.rxSec, txSec: networkTotals.txSec },
    pingMs: Number.isFinite(latency) ? Math.round(latency) : null,
  };
}

export async function startDashboardServer(bot) {
  const enabled = toBool(process.env.DASHBOARD_ENABLED ?? "true");
  if (!enabled) return null;

  const password = String(process.env.DASHBOARD_PASSWORD ?? "");
  const apiKey = String(process.env.DASHBOARD_API_KEY ?? "").trim();
  const jwtSecret = String(process.env.DASHBOARD_JWT_SECRET ?? "");
  const publicUrl = String(process.env.DASHBOARD_PUBLIC_URL ?? "");
  const bindHost = String(process.env.DASHBOARD_BIND ?? DEFAULT_BIND);
  const port = Number(process.env.DASHBOARD_PORT) || DEFAULT_PORT;
  const ttlMin =
    Number(process.env.DASHBOARD_TOKEN_TTL_MIN) || DEFAULT_TOKEN_TTL_MIN;
  const maxLogLines =
    Number(process.env.DASHBOARD_LOG_BUFFER) || DEFAULT_LOG_BUFFER;
  const allowSql = toBool(process.env.DASHBOARD_ALLOW_SQL);
  const allowFileEdit = toBool(process.env.DASHBOARD_ALLOW_FILE_EDIT);
  const turnstileEnabled = toBool(process.env.DASHBOARD_TURNSTILE_ENABLED);
  const turnstileSecret = String(
    process.env.DASHBOARD_TURNSTILE_SECRET ?? "",
  ).trim();
  const turnstileVerifyUrl = String(
    process.env.DASHBOARD_TURNSTILE_VERIFY_URL ??
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  ).trim();
  const authWindowMs = Math.max(
    30_000,
    Number(process.env.DASHBOARD_AUTH_WINDOW_MS) || 10 * 60_000,
  );
  const authMaxAttempts = Math.max(
    3,
    Number(process.env.DASHBOARD_AUTH_MAX_ATTEMPTS) || 6,
  );
  const authLockMs = Math.max(
    60_000,
    Number(process.env.DASHBOARD_AUTH_LOCK_MS) || 15 * 60_000,
  );
  const { allowAll, origins } = parseOrigins(
    process.env.DASHBOARD_ALLOWED_ORIGINS,
  );

  if (!password || !apiKey || !jwtSecret) {
    throw new Error("Dashboard env vars are missing");
  }
  if (turnstileEnabled && !turnstileSecret) {
    throw new Error(
      "Turnstile enabled but DASHBOARD_TURNSTILE_SECRET is missing",
    );
  }

  const clients = new Set();
  const logBuffer = [];

  const jwtIssuer = "WavezBOT";
  const jwtAudience = "dashboard";
  const wsAudience = "dashboard-ws";
  const authFailuresByIp = new Map();
  let storageReady = false;
  let storageReadyPromise = null;

  async function ensureStorageReady() {
    if (storageReady) return;
    if (!storageReadyPromise) {
      storageReadyPromise = initStorage()
        .then(() => {
          storageReady = true;
        })
        .catch((err) => {
          storageReadyPromise = null;
          throw err;
        });
    }
    await storageReadyPromise;
  }

  function signToken() {
    const token = jwt.sign({ sub: "dashboard" }, jwtSecret, {
      expiresIn: `${ttlMin}m`,
      issuer: jwtIssuer,
      audience: jwtAudience,
    });
    const decoded = jwt.decode(token);
    const expiresAt = decoded?.exp ? decoded.exp * 1000 : Date.now();
    return { token, expiresAt };
  }

  function signWsToken(scope = "public") {
    const token = jwt.sign({ sub: "dashboard-ws", scope }, jwtSecret, {
      expiresIn: `${WS_TOKEN_TTL_MIN}m`,
      issuer: jwtIssuer,
      audience: wsAudience,
    });
    const decoded = jwt.decode(token);
    const expiresAt = decoded?.exp ? decoded.exp * 1000 : Date.now();
    return { token, expiresAt };
  }

  function verifyToken(token, audience = jwtAudience) {
    if (!token) return null;
    try {
      return jwt.verify(token, jwtSecret, {
        issuer: jwtIssuer,
        audience,
      });
    } catch {
      return null;
    }
  }

  function isApiKeyValid(value) {
    return value ? timingSafeEqual(value, apiKey) : false;
  }

  function getAuthFailureState(ip) {
    const now = Date.now();
    const prev = authFailuresByIp.get(ip);
    if (!prev) {
      const state = { attempts: 0, windowStartedAt: now, blockedUntil: 0 };
      authFailuresByIp.set(ip, state);
      return state;
    }

    if (prev.blockedUntil > 0 && now >= prev.blockedUntil) {
      prev.blockedUntil = 0;
      prev.attempts = 0;
      prev.windowStartedAt = now;
    }

    if (now - prev.windowStartedAt > authWindowMs) {
      prev.attempts = 0;
      prev.windowStartedAt = now;
    }

    return prev;
  }

  function clearAuthFailureState(ip) {
    authFailuresByIp.delete(ip);
  }

  function registerAuthFailure(ip) {
    const now = Date.now();
    const state = getAuthFailureState(ip);
    state.attempts += 1;

    if (state.attempts >= authMaxAttempts) {
      state.blockedUntil = now + authLockMs;
      state.attempts = 0;
      state.windowStartedAt = now;
      return state.blockedUntil;
    }

    return 0;
  }

  async function verifyTurnstile(token, ip) {
    if (!turnstileEnabled) return true;
    const responseToken = String(token ?? "").trim();
    if (!responseToken) return false;

    try {
      const body = new URLSearchParams();
      body.set("secret", turnstileSecret);
      body.set("response", responseToken);
      if (ip) body.set("remoteip", ip);

      const verifyRes = await fetch(turnstileVerifyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      if (!verifyRes.ok) return false;
      const data = await verifyRes.json().catch(() => ({}));
      return Boolean(data?.success);
    } catch {
      return null;
    }
  }

  function setCors(req, res) {
    const origin = String(req.headers.origin ?? "").trim();
    if (!origin) return;
    if (allowAll && !req.headers.authorization) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      return;
    }
    if (origins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
  }

  function requireApiKey(req, res) {
    const key = getApiKey(req);
    if (!isApiKeyValid(key)) {
      sendError(res, 401, "invalid_api_key");
      return false;
    }
    return true;
  }

  function requireAuth(req, res) {
    if (!requireApiKey(req, res)) return null;
    const token = getBearerToken(req);
    const payload = verifyToken(token);
    if (!payload) {
      sendError(res, 401, "unauthorized");
      return null;
    }
    return payload;
  }

  function broadcast(payload, options = {}) {
    const adminOnly = Boolean(options.adminOnly);
    const data = JSON.stringify(payload);
    for (const ws of clients) {
      if (adminOnly && !ws.isAdmin) continue;
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    }
  }

  function pushLog(entry) {
    logBuffer.push(entry);
    if (logBuffer.length > maxLogLines) {
      logBuffer.splice(0, logBuffer.length - maxLogLines);
    }
    broadcast({ type: "log", payload: entry }, { adminOnly: true });
  }

  function pushDashLog(level, message) {
    const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
    pushLog({
      level,
      source: "dashboard",
      message: String(message ?? ""),
      timestamp: ts,
    });
  }

  const auditLogPath = path.join(ROOT, "logs", "audit.log");
  try {
    fs.mkdirSync(path.join(ROOT, "logs"), { recursive: true });
  } catch {
    /* ignore */
  }

  function writeAuditLog(ip, action, target, result) {
    try {
      const ts = new Date().toISOString();
      const line = `${ts} | ${ip} | ${action} | ${String(target ?? "-").replace(/[\r\n]/g, " ")} | ${String(result ?? "ok").replace(/[\r\n]/g, " ")}\n`;
      fs.appendFileSync(auditLogPath, line, "utf8");
    } catch {
      // audit log failure must never break the request
    }
  }

  const restoreRuntimeLogCapture = installRuntimeLogCapture(pushLog);
  bot.setLogSink(pushLog);

  const server = http.createServer(async (req, res) => {
    const reqStartedAt = Date.now();
    const reqPath = String(req.url ?? "/");
    res.on("finish", () => {
      if (!reqPath.startsWith("/api/")) return;
      const durationMs = Date.now() - reqStartedAt;
      const level = res.statusCode >= 500 ? "error" : "debug";
      const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
      pushLog({
        level,
        source: "web",
        message: `${req.method ?? "GET"} ${reqPath} ${res.statusCode} ${durationMs}ms`,
        timestamp: ts,
      });
    });

    setCors(req, res);
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-API-Key",
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,DELETE,OPTIONS",
    );
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (!requireApiKey(req, res)) return;

    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const pathname = url.pathname;

    try {
      if (req.method === "GET" && pathname === "/api/health") {
        sendJson(res, 200, {
          ok: true,
          version: BOT_VERSION,
          locale: bot.cfg.locale ?? DEFAULT_LOCALE,
        });
        return;
      }

      if (req.method === "POST" && pathname === "/api/auth/login") {
        const ip = getClientIp(req);
        const authState = getAuthFailureState(ip);
        if (authState.blockedUntil > Date.now()) {
          const retryAfterSec = Math.max(
            1,
            Math.ceil((authState.blockedUntil - Date.now()) / 1000),
          );
          res.setHeader("Retry-After", String(retryAfterSec));
          sendError(res, 429, "too_many_attempts");
          return;
        }

        if (!password) {
          sendError(res, 503, "missing_password");
          return;
        }
        const body = await readJson(req);
        if (turnstileEnabled) {
          const turnstileToken = String(body?.turnstileToken ?? "").trim();
          if (!turnstileToken) {
            sendError(res, 400, "missing_turnstile_token");
            return;
          }
          const verified = await verifyTurnstile(turnstileToken, ip);
          if (verified === null) {
            sendError(res, 503, "turnstile_unavailable");
            return;
          }
          if (!verified) {
            sendError(res, 401, "invalid_turnstile");
            return;
          }
        }
        const pass = body?.password ?? "";
        if (!timingSafeEqual(pass, password)) {
          const blockedUntil = registerAuthFailure(ip);
          if (blockedUntil > Date.now()) {
            const retryAfterSec = Math.max(
              1,
              Math.ceil((blockedUntil - Date.now()) / 1000),
            );
            res.setHeader("Retry-After", String(retryAfterSec));
            sendError(res, 429, "too_many_attempts");
            return;
          }
          sendError(res, 401, "invalid_password");
          return;
        }
        clearAuthFailureState(ip);
        const session = signToken();
        sendJson(res, 200, {
          ok: true,
          token: session.token,
          expiresAt: session.expiresAt,
        });
        return;
      }

      if (req.method === "GET" && pathname === "/api/locales") {
        sendJson(res, 200, {
          ok: true,
          locales: SUPPORTED_LOCALES,
          defaultLocale: DEFAULT_LOCALE,
          currentLocale: bot.cfg.locale ?? DEFAULT_LOCALE,
        });
        return;
      }

      if (pathname.startsWith("/api/locales/")) {
        const slug = decodeURIComponent(pathname.replace("/api/locales/", ""));
        const normalized = normalizeLocale(slug);
        if (!SUPPORTED_LOCALES.includes(normalized)) {
          sendError(res, 400, "invalid_locale");
          return;
        }

        if (req.method === "GET") {
          const data = getLocaleData(normalized);
          sendJson(res, 200, {
            ok: true,
            locale: normalized,
            data,
          });
          return;
        }

        if (req.method === "PUT") {
          if (!requireAuth(req, res)) return;
          const body = await readJson(req, 512_000);
          if (!body || typeof body !== "object" || Array.isArray(body)) {
            sendError(res, 400, "invalid_payload");
            return;
          }
          if (!isValidLocaleTree(body)) {
            sendError(res, 400, "invalid_payload");
            return;
          }
          const filePath = getLocaleFilePath(normalized);
          fs.writeFileSync(filePath, JSON.stringify(body, null, 4));
          invalidateLocaleCache(normalized);
          sendJson(res, 200, { ok: true });
          return;
        }
      }

      if (req.method === "GET" && pathname === "/api/session") {
        const bearerToken = getBearerToken(req);
        const payload = verifyToken(bearerToken);
        if (!payload) {
          const siteKey = turnstileEnabled
            ? String(
                process.env.DASHBOARD_TURNSTILE_SITE_KEY ??
                  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ??
                  "",
              ).trim()
            : "";
          sendJson(res, 200, {
            ok: false,
            turnstileRequired: turnstileEnabled,
            turnstileSiteKey: siteKey,
          });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          expiresAt: payload.exp ? payload.exp * 1000 : null,
          state: bot.getDashboardState(),
          config: sanitizeConfig(bot.cfg, publicUrl, enabled),
          version: BOT_VERSION,
        });
        return;
      }

      if (req.method === "GET" && pathname === "/api/commands") {
        const locale = normalizeLocale(
          url.searchParams.get("locale") ?? bot.cfg.locale,
        );
        const prefix = bot.cfg.cmdPrefix ?? "!";
        const commands = bot.commands.all
          .map((cmd) => {
            const description = buildCommandText(
              cmd,
              locale,
              "descriptionKey",
              "description",
            );
            const usage = buildCommandText(cmd, locale, "usageKey", "usage");
            return {
              name: cmd.name,
              aliases: Array.isArray(cmd.aliases) ? cmd.aliases : [],
              description,
              usage,
              minRole: cmd.minRole ?? null,
              cooldownMs: Number(cmd.cooldown ?? 0) || 0,
              deleteOnMs: Number(cmd.deleteOn ?? 0) || 0,
              category: cmd.__category ?? "root",
              file: cmd.__file ?? null,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        const categories = [...new Set(commands.map((c) => c.category))].sort();

        sendJson(res, 200, {
          ok: true,
          prefix,
          locale,
          room: bot.cfg.room,
          roomUrl: bot.cfg.roomUrl ?? "",
          commands,
          categories,
        });
        return;
      }

      if (req.method === "GET" && pathname === "/api/events") {
        const locale = normalizeLocale(
          url.searchParams.get("locale") ?? bot.cfg.locale,
        );
        const events = bot.events.all
          .map((def) => {
            const description = buildEventText(def, locale);
            return {
              name: def.name,
              description,
              enabled: bot.events.isEnabled(def.name),
              cooldownMs:
                typeof def.cooldown === "number" ? def.cooldown : null,
              cooldownScope: def.cooldownScope ?? "global",
              events: Array.isArray(def._events) ? def._events : [],
              category: def.__category ?? "root",
              file: def.__file ?? null,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        const categories = [...new Set(events.map((e) => e.category))].sort();

        sendJson(res, 200, {
          ok: true,
          locale,
          events,
          categories,
        });
        return;
      }

      if (req.method === "GET" && pathname === "/api/overview") {
        try {
          const overview = await getOverviewStats();
          const state = bot.getDashboardState();
          sendJson(res, 200, {
            ok: true,
            ...overview,
            uptimeSec: state.uptimeSec ?? 0,
            songCount: state.songCount ?? 0,
          });
        } catch (err) {
          sendJson(res, 500, {
            ok: false,
            error: "Failed to load overview stats",
          });
        }
        return;
      }

      if (req.method === "GET" && pathname === "/api/rankings") {
        const limit = url.searchParams.get("limit") ?? "10";
        const size = Math.max(1, Math.min(50, Number(limit) || 10));
        const [economy, xp, woot, chat, casinoWins, casinoLosses, dj, songs] =
          await Promise.all([
            listEconomyTop(size),
            listXpTop(size),
            listTopWootUsers(size),
            listTopChatUsers(size),
            listTopCasinoWinners(size),
            listTopCasinoLosers(size),
            listTopDjUsers(size),
            listTopSongs(size),
          ]);
        sendJson(res, 200, {
          ok: true,
          economy,
          xp,
          woot,
          chat,
          casinoWins,
          casinoLosses,
          dj,
          songs,
        });
        return;
      }

      if (req.method === "GET" && pathname === "/api/shop") {
        const locale = normalizeLocale(
          url.searchParams.get("locale") ?? bot.cfg.locale,
        );
        const prefix = bot.cfg.cmdPrefix ?? "!";
        const items = (bot.cfg.shopItems ?? []).map((item) => ({
          key: item.key,
          name: resolveLocalizedValue(item.name, locale) ?? item.key,
          description: resolveLocalizedValue(item.description, locale) ?? "",
          price: item.price ?? 0,
          type: item.type ?? null,
          buyCommand: `${prefix}buy ${item.key}`,
        }));
        const vipEnabled = bot.cfg.vipEnabled !== false;
        const vipLevels = bot.cfg.vipLevels ?? {};
        const vipDurations = bot.cfg.vipDurations ?? {};
        const vipItems = vipEnabled
          ? Object.entries(vipLevels).flatMap(([level, cfg]) =>
              Object.entries(vipDurations).map(([duration, dcfg]) => {
                const base = (cfg.monthlyPrice ?? 0) * ((dcfg.days ?? 30) / 30);
                const disc = dcfg.discountPct ?? 0;
                const price = Math.round(base * (1 - disc / 100));
                return {
                  key: `vip_${level}_${duration}`,
                  level,
                  duration,
                  days: dcfg.days ?? 0,
                  discountPct: disc,
                  price,
                  buyCommand: `${prefix}buy vip ${level} ${duration}`,
                };
              }),
            )
          : [];
        sendJson(res, 200, { ok: true, prefix, items, vipItems, vipEnabled });
        return;
      }

      if (req.method === "GET" && pathname === "/api/vip") {
        const vipEnabled = bot.cfg.vipEnabled !== false;
        const vipLevels = bot.cfg.vipLevels ?? {};
        const vipDurations = bot.cfg.vipDurations ?? {};
        const prefix = bot.cfg.cmdPrefix ?? "!";
        const insurancePricePerDay = bot.cfg.insurancePricePerDay ?? 5;
        const insuranceDiscounts = {
          bronze: bot.cfg.insuranceVipDiscountBronze ?? 0.1,
          silver: bot.cfg.insuranceVipDiscountSilver ?? 0.2,
          gold: bot.cfg.insuranceVipDiscountGold ?? 0.3,
        };
        sendJson(res, 200, {
          ok: true,
          vipEnabled,
          vipLevels,
          vipDurations,
          prefix,
          insurancePricePerDay,
          insuranceDiscounts,
        });
        return;
      }

      if (req.method === "GET" && pathname === "/api/ws-token") {
        const authPayload = verifyToken(getBearerToken(req), jwtAudience);
        const session = signWsToken(authPayload ? "admin" : "public");
        sendJson(res, 200, {
          ok: true,
          token: session.token,
          expiresAt: session.expiresAt,
        });
        return;
      }

      if (!requireAuth(req, res)) return;

      if (req.method === "GET" && pathname === "/api/admin/system") {
        const system = await getSystemStats();
        sendJson(res, 200, { ok: true, system });
        return;
      }

      if (req.method === "GET" && pathname === "/api/mod/users") {
        const limit = Math.max(
          1,
          Math.min(1000, Number(url.searchParams.get("limit") ?? 300) || 300),
        );
        const search = String(url.searchParams.get("search") ?? "").trim();
        const rows = await listUsersForModeration({ limit, search });
        const onlineMap =
          bot?._roomUsers instanceof Map ? bot._roomUsers : new Map();
        const users = rows.map((row) => {
          const uid = String(row.user_id ?? "");
          const onlineUser = onlineMap.get(uid);
          return {
            userId: uid,
            username: row.username ?? null,
            displayName: row.display_name ?? row.username ?? uid,
            level: Number(row.level ?? 0) || 0,
            balance: Number(row.balance ?? 0) || 0,
            chatCount: Number(row.chat_count ?? 0) || 0,
            lastSeenAt: Number(row.last_seen_at ?? 0) || 0,
            updatedAt: Number(row.updated_at ?? 0) || 0,
            activeWarnings: Number(row.active_warnings ?? 0) || 0,
            isOnline: Boolean(onlineUser),
            roomRole: onlineUser?.role ?? null,
          };
        });
        sendJson(res, 200, { ok: true, users });
        return;
      }

      if (req.method === "GET" && pathname === "/api/mod/warnings") {
        const limit = Math.max(
          1,
          Math.min(500, Number(url.searchParams.get("limit") ?? 200) || 200),
        );
        const userId = String(url.searchParams.get("userId") ?? "").trim();
        const includeExpired =
          String(url.searchParams.get("includeExpired") ?? "").trim() === "1";
        const warnings = await listWarningsForModeration({
          limit,
          userId,
          includeExpired,
        });
        sendJson(res, 200, { ok: true, warnings });
        return;
      }

      if (
        req.method === "DELETE" &&
        pathname.startsWith("/api/mod/warnings/")
      ) {
        const idRaw = pathname.replace("/api/mod/warnings/", "");
        const warningId = Number(idRaw);
        if (!Number.isFinite(warningId) || warningId <= 0) {
          sendError(res, 400, "invalid_warning_id");
          return;
        }
        const removed = await deleteWarningById(warningId);
        if (!removed) {
          sendError(res, 404, "warning_not_found");
          return;
        }
        sendJson(res, 200, { ok: true, removed: true, warningId });
        return;
      }

      if (req.method === "POST" && pathname === "/api/mod/warnings/clear") {
        const body = await readJson(req, 500_000);
        const userId = String(body?.userId ?? "").trim();
        if (!userId) {
          sendError(res, 400, "missing_user_id");
          return;
        }
        await clearWarnings(userId);
        writeAuditLog(getClientIp(req), "warnings.clear", userId, "ok");
        sendJson(res, 200, { ok: true, userId });
        return;
      }

      if (req.method === "POST" && pathname === "/api/mod/message") {
        const body = await readJson(req, 500_000);
        const message = String(body?.message ?? "").trim();
        const userId = String(body?.userId ?? "").trim();
        const mentionSelected = Boolean(body?.mentionSelected);
        if (!message) {
          sendError(res, 400, "missing_message");
          return;
        }
        const mentionTarget = userId
          ? ensureMention(
              bot.getRoomUserDisplayName(userId) ||
                body?.displayName ||
                body?.username ||
                userId,
            )
          : "";
        const finalMessage =
          mentionSelected && mentionTarget
            ? `${mentionTarget} ${message}`
            : message;
        await bot.sendChat(finalMessage);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && pathname === "/api/mod/action") {
        const body = await readJson(req, 500_000);
        const action = String(body?.action ?? "")
          .trim()
          .toLowerCase();
        const userId = String(body?.userId ?? "").trim();
        const reason = String(body?.reason ?? "").trim();
        const durationMinutes = Math.max(
          0,
          Number(body?.durationMinutes ?? 0) || 0,
        );

        if (!userId) {
          sendError(res, 400, "missing_user_id");
          return;
        }
        if (bot.isBotUser(userId)) {
          sendError(res, 400, "cannot_target_bot");
          return;
        }

        if (action === "warn") {
          const result = await issueWarning(bot, {
            userId,
            moderatorUserId: "dashboard-admin",
            reason: reason || "Warn via dashboard",
            source: "dashboard",
            banReason: "Auto-ban por warns via dashboard",
          });

          const mentionTarget = ensureMention(
            bot.getRoomUserDisplayName(userId) || userId,
          );
          const reasonText = reason || "conduta inadequada";
          const warnNotice = result?.banned
            ? `${mentionTarget} recebeu warn e foi banido automaticamente (${result.count}/${result.threshold}). Motivo: ${reasonText}.`
            : `${mentionTarget} recebeu warn (${result.count}/${result.threshold}). Motivo: ${reasonText}.`;
          await bot.sendChat(warnNotice);

          writeAuditLog(
            getClientIp(req),
            "mod.warn",
            userId,
            result?.banned
              ? `banned after ${result.count} warns`
              : `warn ${result.count}/${result.threshold}`,
          );
          sendJson(res, 200, { ok: true, action, result });
          return;
        }

        if (action === "ban") {
          const payload = {};
          if (reason) payload.reason = reason;
          bot.wsBanUser(userId, payload);
          writeAuditLog(
            getClientIp(req),
            "mod.ban",
            userId,
            reason || "no reason",
          );
          sendJson(res, 200, { ok: true, action, userId });
          return;
        }

        if (action === "kick") {
          const payload = {};
          if (reason) payload.reason = reason;
          bot.wsKickUser(userId, payload);
          writeAuditLog(
            getClientIp(req),
            "mod.kick",
            userId,
            reason || "no reason",
          );
          sendJson(res, 200, { ok: true, action, userId });
          return;
        }

        if (action === "mute") {
          const durationMs = durationMinutes > 0 ? durationMinutes * 60_000 : 0;
          bot.wsMuteUser(userId, durationMs);
          writeAuditLog(
            getClientIp(req),
            "mod.mute",
            userId,
            durationMinutes ? `${durationMinutes}min` : "permanent",
          );
          sendJson(res, 200, {
            ok: true,
            action,
            userId,
            durationMinutes,
          });
          return;
        }

        if (action === "unmute") {
          bot.wsUnmuteUser(userId);
          writeAuditLog(getClientIp(req), "mod.unmute", userId, "ok");
          sendJson(res, 200, { ok: true, action, userId });
          return;
        }

        sendError(res, 400, "invalid_action");
        return;
      }

      if (pathname === "/api/config") {
        if (req.method === "GET") {
          const configFile = readConfigFile();
          const values = {};
          for (const key of EDITABLE_CONFIG_KEYS) {
            const fromBot = bot.cfg?.[key];
            values[key] = fromBot !== undefined ? fromBot : configFile[key];
          }
          sendJson(res, 200, {
            ok: true,
            values,
            editableKeys: [...EDITABLE_CONFIG_KEYS],
            runtimeKeys: [...RUNTIME_SETTING_KEYS],
            restartKeys: [...RESTART_REQUIRED_KEYS],
          });
          return;
        }

        if (req.method === "PUT") {
          const body = await readJson(req, 2_000_000);
          const updates = body?.updates ?? {};
          if (
            !updates ||
            typeof updates !== "object" ||
            Array.isArray(updates)
          ) {
            sendError(res, 400, "invalid_payload");
            return;
          }
          const configFile = readConfigFile();
          const applied = {};
          const restartKeys = [];

          for (const [key, raw] of Object.entries(updates)) {
            if (!EDITABLE_CONFIG_KEYS.has(key)) continue;
            const value = parseSettingValue(raw);
            configFile[key] = value;
            if (RUNTIME_SETTING_KEYS.includes(key)) {
              await setSetting(key, value);
            }
            bot.updateConfig(key, value);
            if (RESTART_REQUIRED_KEYS.has(key)) restartKeys.push(key);
            applied[key] = value;
          }

          writeConfigFile(configFile);
          writeAuditLog(
            getClientIp(req),
            "config.update",
            Object.keys(applied).join(","),
            `${Object.keys(applied).length} keys`,
          );
          sendJson(res, 200, { ok: true, applied, restartKeys });
          return;
        }
      }

      if (pathname === "/api/files") {
        if (!allowFileEdit) {
          sendError(res, 403, "file_edit_disabled");
          return;
        }
        const type = String(url.searchParams.get("type") ?? "").trim();
        const typeConfig = getFileTypeConfig(type);
        if (!typeConfig) {
          sendError(res, 400, "invalid_type");
          return;
        }
        if (req.method === "GET") {
          const files = typeConfig.listFiles();
          sendJson(res, 200, { ok: true, files });
          return;
        }
      }

      if (pathname === "/api/files/content") {
        if (!allowFileEdit) {
          sendError(res, 403, "file_edit_disabled");
          return;
        }
        const type = String(url.searchParams.get("type") ?? "").trim();
        const file = String(url.searchParams.get("file") ?? "").trim();
        const typeConfig = getFileTypeConfig(type);
        if (!typeConfig) {
          sendError(res, 400, "invalid_type");
          return;
        }
        if (!file) {
          sendError(res, 400, "missing_file");
          return;
        }
        const safePath = resolveSafePath(typeConfig.baseDir, file, {
          allowedExtensions: typeConfig.allowedExtensions,
          blockIndexJs: typeConfig.blockIndexJs,
        });

        if (req.method === "GET") {
          const content = fs.readFileSync(safePath, "utf8");
          sendJson(res, 200, { ok: true, file, content });
          return;
        }

        if (req.method === "PUT") {
          const body = await readJson(req, 2_000_000);
          const content = String(body?.content ?? "");
          fs.writeFileSync(safePath, content);
          writeAuditLog(
            getClientIp(req),
            "files.write",
            file,
            `${content.length} bytes`,
          );
          sendJson(res, 200, { ok: true, file });
          return;
        }

        if (req.method === "POST") {
          const body = await readJson(req, 2_000_000);
          const content = String(body?.content ?? "");
          if (fs.existsSync(safePath)) {
            sendError(res, 409, "file_exists");
            return;
          }
          fs.mkdirSync(path.dirname(safePath), { recursive: true });
          fs.writeFileSync(safePath, content);
          writeAuditLog(
            getClientIp(req),
            "files.create",
            file,
            `${content.length} bytes`,
          );
          sendJson(res, 201, { ok: true, file });
          return;
        }
      }

      if (req.method === "POST" && pathname === "/api/admin/pause") {
        const paused = bot.pause();
        if (paused) pushDashLog("info", "[Dashboard] Bot paused by admin.");
        sendJson(res, 200, { ok: true, paused });
        return;
      }

      if (req.method === "POST" && pathname === "/api/admin/resume") {
        const resumed = bot.resume();
        if (resumed) pushDashLog("info", "[Dashboard] Bot resumed by admin.");
        sendJson(res, 200, { ok: true, resumed });
        return;
      }

      if (req.method === "POST" && pathname === "/api/admin/reload") {
        pushDashLog("info", "[Dashboard] Bot reload requested by admin.");
        await bot.reload();
        pushDashLog("info", "[Dashboard] Bot reload complete.");
        writeAuditLog(getClientIp(req), "admin.reload", "-", "ok");
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && pathname === "/api/admin/reload-commands") {
        pushDashLog("info", "[Dashboard] Reload commands requested by admin.");
        const summary = await bot.reloadCommands();
        pushDashLog(
          "info",
          `[Dashboard] Commands reloaded: ${summary?.loaded ?? 0} loaded, ${summary?.failed ?? 0} failed.`,
        );
        writeAuditLog(
          getClientIp(req),
          "admin.reload-commands",
          "-",
          `loaded=${summary?.loaded ?? 0} failed=${summary?.failed ?? 0}`,
        );
        sendJson(res, 200, { ok: true, summary });
        return;
      }

      if (req.method === "POST" && pathname === "/api/admin/reload-events") {
        pushDashLog("info", "[Dashboard] Reload events requested by admin.");
        const summary = await bot.reloadEvents();
        pushDashLog(
          "info",
          `[Dashboard] Events reloaded: ${summary?.loaded ?? 0} loaded, ${summary?.failed ?? 0} failed.`,
        );
        sendJson(res, 200, { ok: true, summary });
        return;
      }

      if (req.method === "POST" && pathname === "/api/admin/reload-config") {
        pushDashLog("info", "[Dashboard] Reload config requested by admin.");
        reloadConfigSource();
        const nextCfg = loadConfig();
        for (const key of EDITABLE_CONFIG_KEYS) {
          if (!Object.prototype.hasOwnProperty.call(nextCfg, key)) continue;
          const value = nextCfg[key];
          bot.updateConfig(key, value);
        }
        pushDashLog("info", "[Dashboard] Config reloaded from disk.");
        writeAuditLog(getClientIp(req), "admin.reload-config", "-", "ok");
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && pathname === "/api/admin/reload-lang") {
        pushDashLog(
          "info",
          "[Dashboard] Reload language cache requested by admin.",
        );
        invalidateLocaleCache();
        pushDashLog("info", "[Dashboard] Language cache reloaded.");
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "GET" && pathname === "/api/db/tables") {
        await ensureStorageReady();
        const tables = await listDbTables();
        sendJson(res, 200, { ok: true, tables, allowSql });
        return;
      }

      if (req.method === "GET" && pathname === "/api/db/databases") {
        await ensureStorageReady();
        const databases = await listDbDatabases();
        sendJson(res, 200, { ok: true, databases, allowSql });
        return;
      }

      if (req.method === "GET" && pathname === "/api/db/schema") {
        await ensureStorageReady();
        const table = String(url.searchParams.get("name") ?? "").trim();
        if (!table) {
          sendError(res, 400, "missing_table");
          return;
        }
        const columns = await getDbTableColumns(table);
        sendJson(res, 200, { ok: true, table, columns });
        return;
      }

      if (req.method === "GET" && pathname === "/api/db/table") {
        await ensureStorageReady();
        const table = String(url.searchParams.get("name") ?? "").trim();
        const limit = url.searchParams.get("limit") ?? "50";
        const offset = url.searchParams.get("offset") ?? "0";
        if (!table) {
          sendError(res, 400, "missing_table");
          return;
        }
        const data = await getDbTableRows(table, limit, offset);
        sendJson(res, 200, { ok: true, ...data, table });
        return;
      }

      if (req.method === "POST" && pathname === "/api/db/execute") {
        await ensureStorageReady();
        if (!allowSql) {
          sendError(res, 403, "sql_disabled");
          return;
        }
        const body = await readJson(req, 5_000_000);
        const sql = body?.sql ?? "";
        const params = Array.isArray(body?.params) ? body.params : [];
        const result = await executeDbSql(sql, params);
        writeAuditLog(
          getClientIp(req),
          "db.execute",
          String(sql ?? "").slice(0, 200),
          `${Array.isArray(result) ? result.length : 0} rows`,
        );
        sendJson(res, 200, { ok: true, result });
        return;
      }

      if (req.method === "POST" && pathname === "/api/db/row/update") {
        await ensureStorageReady();
        const body = await readJson(req, 2_000_000);
        const table = String(body?.table ?? "").trim();
        const where = body?.where;
        const values = body?.values;
        if (!table) {
          sendError(res, 400, "missing_table");
          return;
        }
        const result = await updateDbTableRow(table, where, values);
        writeAuditLog(getClientIp(req), "db.row.update", table, "ok");
        sendJson(res, 200, { ok: true, result });
        return;
      }

      if (req.method === "POST" && pathname === "/api/db/row/delete") {
        await ensureStorageReady();
        const body = await readJson(req, 2_000_000);
        const table = String(body?.table ?? "").trim();
        const where = body?.where;
        if (!table) {
          sendError(res, 400, "missing_table");
          return;
        }
        const result = await deleteDbTableRow(table, where);
        writeAuditLog(getClientIp(req), "db.row.delete", table, "ok");
        sendJson(res, 200, { ok: true, result });
        return;
      }

      sendError(res, 404, "not_found");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? "");
      pushDashLog("error", `[Dashboard] Internal server error: ${message}`);
      sendError(res, 500, "server_error");
    }
  });

  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const token = url.searchParams.get("token") ?? "";
    const wsToken = url.searchParams.get("wsToken") ?? "";
    const adminPayload = verifyToken(token, jwtAudience);
    const wsPayload = verifyToken(wsToken, wsAudience);
    if (!adminPayload && !wsPayload) {
      ws.close(1008, "Unauthorized");
      return;
    }
    ws.isAdmin =
      Boolean(adminPayload) ||
      Boolean(wsPayload && wsPayload.scope === "admin");
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));

    ws.send(
      JSON.stringify({
        type: "stats",
        payload: {
          state: bot.getDashboardState(),
          config: sanitizeConfig(bot.cfg, publicUrl, enabled),
          version: BOT_VERSION,
        },
      }),
    );

    if (ws.isAdmin && logBuffer.length) {
      ws.send(JSON.stringify({ type: "logs", payload: logBuffer }));
    }
  });

  const statsInterval = setInterval(() => {
    broadcast({
      type: "stats",
      payload: {
        state: bot.getDashboardState(),
        config: sanitizeConfig(bot.cfg, publicUrl, enabled),
        version: BOT_VERSION,
      },
    });
  }, 1500);

  const authCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, state] of authFailuresByIp) {
      if (
        state.blockedUntil < now &&
        now - state.windowStartedAt > authWindowMs
      ) {
        authFailuresByIp.delete(ip);
      }
    }
  }, 5 * 60_000);

  server.listen(port, bindHost);

  return {
    port,
    stop: async () => {
      clearInterval(statsInterval);
      clearInterval(authCleanupInterval);
      bot.setLogSink(null);
      restoreRuntimeLogCapture();
      await new Promise((resolve) => server.close(resolve));
      wss.close();
    },
  };
}
