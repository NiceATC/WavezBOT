/**
 * lib/token-store.js
 *
 * Persists the bot token to .bot-token.json so the bot can reuse it across
 * restarts without going through the full email+password login every time.
 *
 * Token lifecycle:
 *  - On first run (or after expiry): bot logs in, creates a token, saves it here.
 *  - On subsequent runs: bot reads the file, checks expiry (with a 1-hour buffer),
 *    and skips the login flow if the token is still valid.
 *  - If the API rejects the token (e.g. revoked), the caller should call clear()
 *    and retry — the bot will fall back to the login flow automatically.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(__dirname, "..", ".bot-token.json");

/** How early (ms) to consider the token expired before it actually expires. */
const EXPIRY_BUFFER_MS = 60 * 60 * 1000; // 1 hour

/**
 * @typedef {{ token: string, expiresAt: string, botUserId: string|null, botName: string|null, actorRole: string|null }} StoredToken
 */

/**
 * Read the stored token. Returns null if the file is missing, unreadable, or malformed.
 * @returns {StoredToken|null}
 */
export function readStoredToken() {
  try {
    const raw = fs.readFileSync(TOKEN_FILE, "utf8");
    const data = JSON.parse(raw);
    if (typeof data?.token !== "string" || !data.token) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Check if a stored token is still usable (not expired, with buffer).
 * @param {StoredToken} stored
 * @returns {boolean}
 */
export function isTokenValid(stored) {
  if (!stored?.token || !stored?.expiresAt) return false;
  const expiresAt = new Date(stored.expiresAt).getTime();
  if (!Number.isFinite(expiresAt)) return false;
  return Date.now() < expiresAt - EXPIRY_BUFFER_MS;
}

/**
 * Persist a freshly generated token to disk.
 * @param {{ token: string, expiresAt: string, botUserId?: string, botName?: string, actorRole?: string }} tokenData
 */
export function saveToken(tokenData) {
  const record = {
    token: tokenData.token,
    expiresAt: tokenData.expiresAt ?? null,
    botUserId: tokenData.botUserId ?? null,
    botName: tokenData.botName ?? null,
    actorRole: tokenData.actorRole ?? null,
    savedAt: new Date().toISOString(),
  };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(record, null, 2), "utf8");
}

/**
 * Delete the stored token file (call this when the token is rejected by the API).
 */
export function clearStoredToken() {
  try {
    fs.unlinkSync(TOKEN_FILE);
  } catch {
    // already gone — fine
  }
}
