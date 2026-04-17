import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRAPPED = Symbol.for("wavez.apiTrafficLoggerWrapped");

const WS_CHAT_EVENTS = new Set([
  "message_created",
  "message_updated",
  "message_deleted",
  "chat_cleared",
  "send_chat",
]);

const WS_ROOM_EVENTS = new Set([
  "room_state_snapshot",
  "waitlist_update",
  "waitlist_join",
  "waitlist_leave",
  "queue_reordered",
  "join_room",
  "leave_room",
  "remove_from_queue",
  "reorder_queue",
]);

const WS_TRACK_EVENTS = new Set([
  "track_started",
  "track_skipped",
  "track_paused",
  "track_resumed",
  "track_grabbed",
  "votes_snapshot",
  "skip",
]);

const WS_USER_EVENTS = new Set([
  "user_joined",
  "user_left",
  "user_kicked",
  "user_banned",
  "user_role_updated",
  "user_updated",
  "mute_user",
  "kick_user",
  "ban_user",
]);

const WS_CONNECTION_EVENTS = new Set([
  "open",
  "close",
  "connected",
  "socket_error",
  "ping",
  "pong",
]);

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function shouldMaskKey(key) {
  if (!key) return false;
  const k = String(key).toLowerCase();
  return (
    k.includes("password") ||
    k.includes("token") ||
    k === "authorization" ||
    k === "cookie" ||
    k === "set-cookie" ||
    k.includes("secret")
  );
}

function maskSecret(value) {
  if (value == null) return value;
  const text = String(value);
  if (text.length <= 8) return "***";
  return `${text.slice(0, 4)}***${text.slice(-2)}`;
}

function serializeHeaders(headersLike) {
  if (!headersLike) return null;
  try {
    if (typeof headersLike.forEach === "function") {
      const out = {};
      headersLike.forEach((v, k) => {
        out[k] = shouldMaskKey(k) ? maskSecret(v) : v;
      });
      return out;
    }
  } catch {
    // ignore
  }

  if (Array.isArray(headersLike)) {
    const out = {};
    for (const item of headersLike) {
      if (!Array.isArray(item) || item.length < 2) continue;
      const k = String(item[0]);
      const v = item[1];
      out[k] = shouldMaskKey(k) ? maskSecret(v) : v;
    }
    return out;
  }

  if (typeof headersLike === "object") {
    const out = {};
    for (const [k, v] of Object.entries(headersLike)) {
      out[k] = shouldMaskKey(k) ? maskSecret(v) : v;
    }
    return out;
  }

  return String(headersLike);
}

function sanitize(value, depth = 0, seen = new WeakSet()) {
  if (value == null) return value;
  if (depth > 10) return "[MaxDepth]";

  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;
  if (t === "bigint") return value.toString();
  if (t === "function") return `[Function:${value.name || "anonymous"}]`;
  if (t === "symbol") return String(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      status: value.status,
      code: value.code,
      response: sanitize(value.response, depth + 1, seen),
    };
  }

  if (typeof Headers !== "undefined" && value instanceof Headers) {
    return serializeHeaders(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, depth + 1, seen));
  }

  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()].map(([k, v]) => [String(k), sanitize(v, depth + 1, seen)]),
    );
  }

  if (value instanceof Set) {
    return [...value.values()].map((item) => sanitize(item, depth + 1, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);

    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (shouldMaskKey(k)) {
        out[k] = maskSecret(v);
        continue;
      }
      out[k] = sanitize(v, depth + 1, seen);
    }
    return out;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function normalizeResult(result) {
  const safe = sanitize(result);
  if (!result || typeof result !== "object") return safe;

  const out = { ...safe };
  if ("headers" in result) {
    out.headers = serializeHeaders(result.headers);
  }
  return out;
}

function normalizeCategory(value) {
  const clean = String(value ?? "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || "unknown";
}

function resolveRestCategory(op) {
  const parts = String(op ?? "")
    .split(".")
    .filter(Boolean);

  if (!parts.length) return "rest";

  const root = parts[0] === "client" ? parts[1] : parts[0];
  if (!root) return "rest";

  if (root === "roomBot") return "room-bot";
  if (root === "api") return "core";
  return normalizeCategory(root);
}

function resolveWsCategory(entry) {
  const event = String(entry?.op ?? entry?.packet?.event ?? "");

  if (WS_CHAT_EVENTS.has(event)) return "chat";
  if (WS_ROOM_EVENTS.has(event)) return "room";
  if (WS_TRACK_EVENTS.has(event)) return "track";
  if (WS_USER_EVENTS.has(event)) return "user";
  if (WS_CONNECTION_EVENTS.has(event)) return "realtime";
  if (event === "error") return "error";
  return "realtime";
}

function defaultCategoryResolver(entry) {
  if (!entry || typeof entry !== "object") return "misc";
  if (entry.type === "rest") return resolveRestCategory(entry.op);
  if (entry.type === "ws") return resolveWsCategory(entry);
  return "misc";
}

export function createApiTrafficLogger(options = {}) {
  const enabled = options.enabled !== false;
  const legacyPath = options.filePath
    ? path.resolve(ROOT, options.filePath)
    : null;
  const logDir = path.resolve(
    ROOT,
    options.logDir || (legacyPath ? path.dirname(legacyPath) : "logs/debug/api"),
  );
  const maxFileBytes = Math.max(1, Number(options.maxFileMB ?? 256)) * 1024 * 1024;
  const maxEntryBytes = Math.max(1, Number(options.maxEntryKB ?? 2048)) * 1024;
  const categoryResolver =
    typeof options.categoryResolver === "function"
      ? options.categoryResolver
      : defaultCategoryResolver;

  if (!enabled) {
    return {
      enabled: false,
      logDir,
      write: () => {},
    };
  }

  fs.mkdirSync(logDir, { recursive: true });

  function rotateIfNeeded(targetPath) {
    try {
      const st = fs.statSync(targetPath);
      if (st.size < maxFileBytes) return;
      const rotated = `${targetPath}.1`;
      if (fs.existsSync(rotated)) {
        fs.unlinkSync(rotated);
      }
      fs.renameSync(targetPath, rotated);
    } catch {
      // ignore rotate failures
    }
  }

  function write(entry) {
    try {
      const category = normalizeCategory(categoryResolver(entry));
      const targetPath = path.join(logDir, `${category}.jsonl`);
      rotateIfNeeded(targetPath);

      let payload = { ts: nowIso(), category, ...sanitize(entry) };
      let line = JSON.stringify(payload);
      if (Buffer.byteLength(line, "utf8") > maxEntryBytes) {
        payload = {
          ts: nowIso(),
          category,
          type: payload.type,
          direction: payload.direction,
          op: payload.op,
          meta: payload.meta,
          truncated: true,
          originalBytes: Buffer.byteLength(line, "utf8"),
        };
        line = JSON.stringify(payload);
      }
      fs.appendFileSync(targetPath, `${line}\n`, "utf8");
    } catch {
      // logger should never crash bot
    }
  }

  return {
    enabled: true,
    logDir,
    write,
  };
}

function wrapFunctionWithLogging(target, methodName, opName, logger, metaProvider) {
  const original = target[methodName];
  if (typeof original !== "function") return;
  if (original[WRAPPED]) return;

  const wrapped = function wrappedApiMethod(...args) {
    const opId = createId("rest");
    const startedAt = Date.now();
    const meta = metaProvider?.() ?? {};
    logger.write({
      type: "rest",
      direction: "out",
      op: opName,
      opId,
      args,
      meta,
    });

    try {
      const result = original.apply(this, args);
      if (result && typeof result.then === "function") {
        return result
          .then((value) => {
            logger.write({
              type: "rest",
              direction: "in",
              op: opName,
              opId,
              elapsedMs: Date.now() - startedAt,
              ok: true,
              result: normalizeResult(value),
              meta,
            });
            return value;
          })
          .catch((error) => {
            logger.write({
              type: "rest",
              direction: "in",
              op: opName,
              opId,
              elapsedMs: Date.now() - startedAt,
              ok: false,
              error,
              meta,
            });
            throw error;
          });
      }

      logger.write({
        type: "rest",
        direction: "in",
        op: opName,
        opId,
        elapsedMs: Date.now() - startedAt,
        ok: true,
        result: normalizeResult(result),
        meta,
      });
      return result;
    } catch (error) {
      logger.write({
        type: "rest",
        direction: "in",
        op: opName,
        opId,
        elapsedMs: Date.now() - startedAt,
        ok: false,
        error,
        meta,
      });
      throw error;
    }
  };

  wrapped[WRAPPED] = true;
  target[methodName] = wrapped;
}

function shouldSkipObject(obj) {
  if (!obj || typeof obj !== "object") return true;
  const name = obj?.constructor?.name ?? "";
  return (
    name === "Headers" ||
    name === "URL" ||
    name === "URLSearchParams" ||
    name === "AbortController" ||
    name === "AbortSignal"
  );
}

function wrapObjectMethods(obj, pathParts, logger, metaProvider, seen = new WeakSet()) {
  if (!obj || typeof obj !== "object") return;
  if (shouldSkipObject(obj)) return;
  if (seen.has(obj)) return;
  seen.add(obj);

  const ownKeys = Object.keys(obj);
  const proto = Object.getPrototypeOf(obj);
  const protoKeys =
    proto && proto !== Object.prototype
      ? Object.getOwnPropertyNames(proto).filter((k) => k !== "constructor")
      : [];

  const keys = [...new Set([...ownKeys, ...protoKeys])];

  for (const key of keys) {
    const value = obj[key];
    const nextPath = [...pathParts, key];
    if (typeof value === "function") {
      wrapFunctionWithLogging(obj, key, nextPath.join("."), logger, metaProvider);
      continue;
    }
    if (value && typeof value === "object") {
      wrapObjectMethods(value, nextPath, logger, metaProvider, seen);
    }
  }
}

export function attachApiClientTrafficLogger(client, logger, metaProvider) {
  if (!client || !logger?.enabled) return client;
  wrapObjectMethods(client, ["client"], logger, metaProvider);
  return client;
}

export function attachRealtimeTrafficLogger(realtimeClient, logger, metaProvider) {
  if (!realtimeClient || !logger?.enabled) return realtimeClient;

  const meta = () => (metaProvider?.() ?? {});

  const onPacket = (packet) => {
    logger.write({
      type: "ws",
      direction: "in",
      op: packet?.event ?? "packet",
      packet,
      meta: meta(),
    });
  };

  realtimeClient.on("packet", onPacket);

  for (const event of ["open", "close", "connected", "socket_error"]) {
    realtimeClient.on(event, (packet) => {
      logger.write({
        type: "ws",
        direction: "in",
        op: event,
        packet,
        meta: meta(),
      });
    });
  }

  for (const methodName of ["send", "joinRoom", "leaveRoom", "ping", "sendChat"]) {
    wrapFunctionWithLogging(realtimeClient, methodName, `ws.${methodName}`, logger, meta);
  }

  return realtimeClient;
}
