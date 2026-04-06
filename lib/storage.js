// lib/storage.js
// Simple SQLite wrapper for persistent storage (settings, blacklists, etc)

import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";

const DB_PATH = path.resolve(process.cwd(), "wavezbot.sqlite");

let db = null;

function ensureDb() {
  if (!db) {
    throw new Error("Storage not initialized");
  }
}

export async function initStorage() {
  if (db) return;
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });
  // Example: settings table
  await db.exec(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
  // Example: blacklist table
  await db.exec(`CREATE TABLE IF NOT EXISTS blacklist (
    type TEXT,
    value TEXT,
    PRIMARY KEY (type, value)
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS track_blacklist (
    track_id TEXT PRIMARY KEY,
    source TEXT,
    source_id TEXT,
    title TEXT,
    artist TEXT,
    added_at INTEGER
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS waitlist_snapshot (
    user_id TEXT PRIMARY KEY,
    position INTEGER,
    username TEXT,
    display_name TEXT,
    updated_at INTEGER
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS greet_state (
    user_id TEXT PRIMARY KEY,
    greeted_at INTEGER,
    greeted_count INTEGER
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS afk_state (
    user_id TEXT PRIMARY KEY,
    last_chat_at INTEGER,
    last_join_at INTEGER,
    updated_at INTEGER
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS economy_balance (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    display_name TEXT,
    balance INTEGER,
    updated_at INTEGER
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS xp_state (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    display_name TEXT,
    level INTEGER,
    xp INTEGER,
    xp_total INTEGER,
    updated_at INTEGER
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS user_rewards (
    user_id TEXT,
    type TEXT,
    reward_key TEXT,
    level INTEGER,
    created_at INTEGER,
    PRIMARY KEY (user_id, type, reward_key)
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS daily_reward (
    user_id TEXT PRIMARY KEY,
    last_claim_at INTEGER,
    streak INTEGER,
    updated_at INTEGER
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS work_state (
    user_id TEXT PRIMARY KEY,
    job_key TEXT,
    last_claim_at INTEGER,
    updated_at INTEGER
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS shop_purchases (
    user_id TEXT,
    item_key TEXT,
    quantity INTEGER,
    updated_at INTEGER,
    PRIMARY KEY (user_id, item_key)
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS track_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id TEXT,
    title TEXT,
    artist TEXT,
    dj_id TEXT,
    dj_name TEXT,
    played_at INTEGER
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS user_woot_stats (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    display_name TEXT,
    woots INTEGER,
    updated_at INTEGER
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS user_dj_stats (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    display_name TEXT,
    plays INTEGER,
    updated_at INTEGER
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS song_stats (
    track_id TEXT PRIMARY KEY,
    source TEXT,
    source_id TEXT,
    title TEXT,
    artist TEXT,
    plays INTEGER,
    woots INTEGER,
    updated_at INTEGER,
    last_played_at INTEGER
  )`);
}

export async function setSetting(key, value) {
  await db.run(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    key,
    JSON.stringify(value),
  );
}

export async function getSetting(key, fallback = null) {
  const row = await db.get("SELECT value FROM settings WHERE key = ?", key);
  return row ? JSON.parse(row.value) : fallback;
}

export async function getAllSettings() {
  const rows = await db.all("SELECT key, value FROM settings");
  const out = {};
  for (const row of rows) {
    out[row.key] = JSON.parse(row.value);
  }
  return out;
}

export async function addBlacklist(type, value) {
  await db.run(
    "INSERT OR IGNORE INTO blacklist (type, value) VALUES (?, ?)",
    type,
    value,
  );
}

export async function removeBlacklist(type, value) {
  await db.run(
    "DELETE FROM blacklist WHERE type = ? AND value = ?",
    type,
    value,
  );
}

export async function getBlacklist(type) {
  const rows = await db.all("SELECT value FROM blacklist WHERE type = ?", type);
  return rows.map((r) => r.value);
}

// ── Track blacklist (music) ───────────────────────────────────────────────

export async function addTrackBlacklist(entry) {
  await db.run(
    "INSERT OR REPLACE INTO track_blacklist (track_id, source, source_id, title, artist, added_at) VALUES (?, ?, ?, ?, ?, ?)",
    entry.trackId,
    entry.source,
    entry.sourceId,
    entry.title,
    entry.artist,
    entry.addedAt ?? Date.now(),
  );
}

export async function removeTrackBlacklist(trackId) {
  await db.run("DELETE FROM track_blacklist WHERE track_id = ?", trackId);
}

export async function getTrackBlacklist(trackId) {
  return db.get("SELECT * FROM track_blacklist WHERE track_id = ?", trackId);
}

export async function listTrackBlacklist(limit = 20) {
  const rows = await db.all(
    "SELECT * FROM track_blacklist ORDER BY added_at DESC LIMIT ?",
    limit,
  );
  return rows;
}

// ── Waitlist snapshot (DC restore) ─────────────────────────────────────────

export async function upsertWaitlistSnapshot(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return;
  const now = Date.now();
  await db.exec("BEGIN");
  try {
    for (const entry of entries) {
      await db.run(
        "INSERT OR REPLACE INTO waitlist_snapshot (user_id, position, username, display_name, updated_at) VALUES (?, ?, ?, ?, ?)",
        String(entry.userId),
        Number(entry.position),
        entry.username ?? null,
        entry.displayName ?? null,
        entry.updatedAt ?? now,
      );
    }
    await db.exec("COMMIT");
  } catch (err) {
    await db.exec("ROLLBACK");
    throw err;
  }
}

export async function getWaitlistSnapshot(userId) {
  return db.get(
    "SELECT * FROM waitlist_snapshot WHERE user_id = ?",
    String(userId),
  );
}

// ── Greet state (welcome persistence) ─────────────────────────────────────

export async function getGreetState(userId) {
  return db.get("SELECT * FROM greet_state WHERE user_id = ?", String(userId));
}

export async function upsertGreetState({ userId, greetedAt, greetedCount }) {
  if (userId == null) return;
  await db.run(
    "INSERT OR REPLACE INTO greet_state (user_id, greeted_at, greeted_count) VALUES (?, ?, ?)",
    String(userId),
    Number(greetedAt) || Date.now(),
    Number.isFinite(greetedCount) ? greetedCount : 1,
  );
}

// ── AFK state (activity persistence) ─────────────────────────────────────

export async function listAfkState() {
  return db.all("SELECT * FROM afk_state");
}

export async function getAfkState(userId) {
  if (userId == null) return null;
  return db.get("SELECT * FROM afk_state WHERE user_id = ?", String(userId));
}

export async function upsertAfkState({ userId, lastChatAt, lastJoinAt }) {
  if (userId == null) return;
  const uid = String(userId);
  const existing = await db.get(
    "SELECT last_chat_at, last_join_at FROM afk_state WHERE user_id = ?",
    uid,
  );

  const toStamp = (value) => {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? Math.floor(num) : null;
  };

  const chatAt = toStamp(lastChatAt ?? existing?.last_chat_at ?? null);
  const joinAt = toStamp(lastJoinAt ?? existing?.last_join_at ?? null);
  const updatedAt = Date.now();

  await db.run(
    "INSERT OR REPLACE INTO afk_state (user_id, last_chat_at, last_join_at, updated_at) VALUES (?, ?, ?, ?)",
    uid,
    chatAt,
    joinAt,
    updatedAt,
  );
}

export async function upsertAfkStateBatch(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return;

  const toStamp = (value) => {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? Math.floor(num) : null;
  };

  const now = Date.now();
  await db.exec("BEGIN");
  try {
    for (const entry of entries) {
      const uid = String(entry.userId ?? "");
      if (!uid) continue;
      const chatAt = toStamp(entry.lastChatAt ?? null);
      const joinAt = toStamp(entry.lastJoinAt ?? null);
      await db.run(
        "INSERT OR REPLACE INTO afk_state (user_id, last_chat_at, last_join_at, updated_at) VALUES (?, ?, ?, ?)",
        uid,
        chatAt,
        joinAt,
        entry.updatedAt ?? now,
      );
    }
    await db.exec("COMMIT");
  } catch (err) {
    await db.exec("ROLLBACK");
    throw err;
  }
}

// ── Economy / XP state ─────────────────────────────────────────────────

export async function getEconomyBalance(userId) {
  if (userId == null) return null;
  return db.get(
    "SELECT user_id, username, display_name, balance FROM economy_balance WHERE user_id = ?",
    String(userId),
  );
}

export async function setEconomyBalance(userId, balance, identity = {}) {
  if (userId == null) return;
  const uid = String(userId);
  const username = identity.username ?? null;
  const displayName = identity.displayName ?? identity.display_name ?? null;
  const updatedAt = Date.now();
  await db.run(
    "INSERT INTO economy_balance (user_id, username, display_name, balance, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at, username = COALESCE(excluded.username, economy_balance.username), display_name = COALESCE(excluded.display_name, economy_balance.display_name)",
    uid,
    username,
    displayName,
    Number(balance) || 0,
    updatedAt,
  );
}

export async function listEconomyTop(limit = 10) {
  const size = Math.max(1, Math.min(50, Number(limit) || 10));
  return db.all(
    "SELECT user_id, username, display_name, balance FROM economy_balance ORDER BY balance DESC LIMIT ?",
    size,
  );
}

export async function getXpState(userId) {
  if (userId == null) return null;
  return db.get(
    "SELECT user_id, username, display_name, level, xp, xp_total FROM xp_state WHERE user_id = ?",
    String(userId),
  );
}

export async function setXpState({
  userId,
  level,
  xp,
  xpTotal,
  username,
  displayName,
}) {
  if (userId == null) return;
  const uid = String(userId);
  const updatedAt = Date.now();
  await db.run(
    "INSERT INTO xp_state (user_id, username, display_name, level, xp, xp_total, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET level = excluded.level, xp = excluded.xp, xp_total = excluded.xp_total, updated_at = excluded.updated_at, username = COALESCE(excluded.username, xp_state.username), display_name = COALESCE(excluded.display_name, xp_state.display_name)",
    uid,
    username ?? null,
    displayName ?? null,
    Math.max(1, Number(level) || 1),
    Number(xp) || 0,
    Number(xpTotal) || 0,
    updatedAt,
  );
}

export async function listXpTop(limit = 10) {
  const size = Math.max(1, Math.min(50, Number(limit) || 10));
  return db.all(
    "SELECT user_id, username, display_name, level, xp, xp_total FROM xp_state ORDER BY level DESC, xp_total DESC LIMIT ?",
    size,
  );
}

export async function addUserReward(userId, type, rewardKey, level) {
  if (userId == null || !type || !rewardKey) return;
  await db.run(
    "INSERT OR IGNORE INTO user_rewards (user_id, type, reward_key, level, created_at) VALUES (?, ?, ?, ?, ?)",
    String(userId),
    String(type),
    String(rewardKey),
    Number(level) || 0,
    Date.now(),
  );
}

// ── Daily reward ───────────────────────────────────────────────────────

export async function getDailyRewardState(userId) {
  if (userId == null) return null;
  return db.get(
    "SELECT user_id, last_claim_at, streak FROM daily_reward WHERE user_id = ?",
    String(userId),
  );
}

export async function setDailyRewardState({ userId, lastClaimAt, streak }) {
  if (userId == null) return;
  const uid = String(userId);
  const updatedAt = Date.now();
  const claimAt = Number(lastClaimAt) || updatedAt;
  const nextStreak = Number.isFinite(streak) ? Math.max(0, streak) : 0;
  await db.run(
    "INSERT OR REPLACE INTO daily_reward (user_id, last_claim_at, streak, updated_at) VALUES (?, ?, ?, ?)",
    uid,
    claimAt,
    nextStreak,
    updatedAt,
  );
}

// ── Work state ─────────────────────────────────────────────────────────

export async function getWorkState(userId) {
  if (userId == null) return null;
  return db.get(
    "SELECT user_id, job_key, last_claim_at FROM work_state WHERE user_id = ?",
    String(userId),
  );
}

export async function setWorkState({ userId, jobKey, lastClaimAt }) {
  if (userId == null) return;
  const uid = String(userId);
  const updatedAt = Date.now();
  await db.run(
    "INSERT OR REPLACE INTO work_state (user_id, job_key, last_claim_at, updated_at) VALUES (?, ?, ?, ?)",
    uid,
    jobKey ?? null,
    Number(lastClaimAt) || null,
    updatedAt,
  );
}

// ── Shop purchases ─────────────────────────────────────────────────────

export async function getShopPurchase(userId, itemKey) {
  if (userId == null || !itemKey) return null;
  return db.get(
    "SELECT user_id, item_key, quantity FROM shop_purchases WHERE user_id = ? AND item_key = ?",
    String(userId),
    String(itemKey),
  );
}

export async function addShopPurchase(userId, itemKey, amount = 1) {
  if (userId == null || !itemKey) return;
  const uid = String(userId);
  const key = String(itemKey);
  const delta = Math.max(1, Math.floor(Number(amount) || 1));
  const updatedAt = Date.now();
  await db.run(
    "INSERT INTO shop_purchases (user_id, item_key, quantity, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, item_key) DO UPDATE SET quantity = shop_purchases.quantity + excluded.quantity, updated_at = excluded.updated_at",
    uid,
    key,
    delta,
    updatedAt,
  );
}

// ── Leaderboards / track history ───────────────────────────────────────

const TRACK_HISTORY_LIMIT_DEFAULT = 50;

function clampLimit(value, fallback) {
  const size = Math.floor(Number(value) || fallback || 0);
  if (!Number.isFinite(size) || size <= 0) return fallback;
  return Math.max(1, Math.min(50, size));
}

export async function addTrackHistory(
  entry,
  limit = TRACK_HISTORY_LIMIT_DEFAULT,
) {
  if (!entry) return;
  const playedAt = Number(entry.playedAt ?? Date.now()) || Date.now();
  const size = clampLimit(limit, TRACK_HISTORY_LIMIT_DEFAULT);
  await db.exec("BEGIN");
  try {
    await db.run(
      "INSERT INTO track_history (track_id, title, artist, dj_id, dj_name, played_at) VALUES (?, ?, ?, ?, ?, ?)",
      entry.trackId ?? null,
      entry.title ?? null,
      entry.artist ?? null,
      entry.djId ?? null,
      entry.djName ?? null,
      playedAt,
    );
    await db.run(
      "DELETE FROM track_history WHERE id NOT IN (SELECT id FROM track_history ORDER BY played_at DESC LIMIT ?)",
      size,
    );
    await db.exec("COMMIT");
  } catch (err) {
    await db.exec("ROLLBACK");
    throw err;
  }
}

export async function listTrackHistory(limit = 5) {
  const size = clampLimit(limit, 5);
  return db.all(
    "SELECT * FROM track_history ORDER BY played_at DESC LIMIT ?",
    size,
  );
}

export async function incrementUserWoot(userId, identity = {}, amount = 1) {
  if (userId == null) return;
  const uid = String(userId);
  const delta = Math.max(1, Math.floor(Number(amount) || 1));
  const username = identity.username ?? null;
  const displayName = identity.displayName ?? identity.display_name ?? null;
  const updatedAt = Date.now();
  await db.run(
    "INSERT INTO user_woot_stats (user_id, username, display_name, woots, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET woots = user_woot_stats.woots + excluded.woots, updated_at = excluded.updated_at, username = COALESCE(excluded.username, user_woot_stats.username), display_name = COALESCE(excluded.display_name, user_woot_stats.display_name)",
    uid,
    username,
    displayName,
    delta,
    updatedAt,
  );
}

export async function incrementUserDjPlay(userId, identity = {}, amount = 1) {
  if (userId == null) return;
  const uid = String(userId);
  const delta = Math.max(1, Math.floor(Number(amount) || 1));
  const username = identity.username ?? null;
  const displayName = identity.displayName ?? identity.display_name ?? null;
  const updatedAt = Date.now();
  await db.run(
    "INSERT INTO user_dj_stats (user_id, username, display_name, plays, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET plays = user_dj_stats.plays + excluded.plays, updated_at = excluded.updated_at, username = COALESCE(excluded.username, user_dj_stats.username), display_name = COALESCE(excluded.display_name, user_dj_stats.display_name)",
    uid,
    username,
    displayName,
    delta,
    updatedAt,
  );
}

export async function incrementSongPlay(entry, amount = 1) {
  if (!entry?.trackId) return;
  const trackId = String(entry.trackId);
  const delta = Math.max(1, Math.floor(Number(amount) || 1));
  const updatedAt = Date.now();
  const lastPlayedAt = Number(entry.lastPlayedAt ?? updatedAt) || updatedAt;
  await db.run(
    "INSERT INTO song_stats (track_id, source, source_id, title, artist, plays, woots, updated_at, last_played_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?) ON CONFLICT(track_id) DO UPDATE SET plays = song_stats.plays + excluded.plays, updated_at = excluded.updated_at, last_played_at = excluded.last_played_at, source = COALESCE(excluded.source, song_stats.source), source_id = COALESCE(excluded.source_id, song_stats.source_id), title = COALESCE(excluded.title, song_stats.title), artist = COALESCE(excluded.artist, song_stats.artist)",
    trackId,
    entry.source ?? null,
    entry.sourceId ?? null,
    entry.title ?? null,
    entry.artist ?? null,
    delta,
    updatedAt,
    lastPlayedAt,
  );
}

export async function incrementSongWoot(entry, amount = 1) {
  if (!entry?.trackId) return;
  const trackId = String(entry.trackId);
  const delta = Math.max(1, Math.floor(Number(amount) || 1));
  const updatedAt = Date.now();
  await db.run(
    "INSERT INTO song_stats (track_id, source, source_id, title, artist, plays, woots, updated_at, last_played_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?) ON CONFLICT(track_id) DO UPDATE SET woots = song_stats.woots + excluded.woots, updated_at = excluded.updated_at, source = COALESCE(excluded.source, song_stats.source), source_id = COALESCE(excluded.source_id, song_stats.source_id), title = COALESCE(excluded.title, song_stats.title), artist = COALESCE(excluded.artist, song_stats.artist)",
    trackId,
    entry.source ?? null,
    entry.sourceId ?? null,
    entry.title ?? null,
    entry.artist ?? null,
    delta,
    updatedAt,
    entry.lastPlayedAt ?? null,
  );
}

export async function listTopWootUsers(limit = 10) {
  const size = clampLimit(limit, 10);
  return db.all(
    "SELECT user_id, username, display_name, woots FROM user_woot_stats ORDER BY woots DESC LIMIT ?",
    size,
  );
}

export async function listTopDjUsers(limit = 10) {
  const size = clampLimit(limit, 10);
  return db.all(
    "SELECT user_id, username, display_name, plays FROM user_dj_stats ORDER BY plays DESC LIMIT ?",
    size,
  );
}

export async function listTopSongs(limit = 10) {
  const size = clampLimit(limit, 10);
  return db.all(
    "SELECT track_id, source, source_id, title, artist, plays, woots FROM song_stats ORDER BY woots DESC, plays DESC LIMIT ?",
    size,
  );
}

export async function getUserWootStats(userId) {
  if (userId == null) return null;
  return db.get(
    "SELECT user_id, username, display_name, woots FROM user_woot_stats WHERE user_id = ?",
    String(userId),
  );
}

export async function getUserDjStats(userId) {
  if (userId == null) return null;
  return db.get(
    "SELECT user_id, username, display_name, plays FROM user_dj_stats WHERE user_id = ?",
    String(userId),
  );
}

export async function getUserWootRank(userId) {
  if (userId == null) return null;
  const row = await db.get(
    "SELECT woots FROM user_woot_stats WHERE user_id = ?",
    String(userId),
  );
  if (!row) return null;
  const rankRow = await db.get(
    "SELECT COUNT(*) + 1 AS rank FROM user_woot_stats WHERE woots > ?",
    row.woots ?? 0,
  );
  return { rank: Number(rankRow?.rank ?? 1), count: Number(row.woots ?? 0) };
}

export async function getUserDjRank(userId) {
  if (userId == null) return null;
  const row = await db.get(
    "SELECT plays FROM user_dj_stats WHERE user_id = ?",
    String(userId),
  );
  if (!row) return null;
  const rankRow = await db.get(
    "SELECT COUNT(*) + 1 AS rank FROM user_dj_stats WHERE plays > ?",
    row.plays ?? 0,
  );
  return { rank: Number(rankRow?.rank ?? 1), count: Number(row.plays ?? 0) };
}

export async function resetLeaderboards() {
  await db.exec("DELETE FROM user_woot_stats");
  await db.exec("DELETE FROM user_dj_stats");
  await db.exec("DELETE FROM song_stats");
}

export async function getLeaderboardResetAt() {
  const value = await getSetting("_leaderboardResetAt", null);
  const stamp = Number(value ?? 0);
  return Number.isFinite(stamp) && stamp > 0 ? stamp : null;
}

export async function setLeaderboardResetAt(stamp) {
  const value = Number(stamp) || Date.now();
  await setSetting("_leaderboardResetAt", value);
}

// ── Casino jackpot ─────────────────────────────────────────────────────

export async function getCasinoJackpot() {
  const value = await getSetting("_casinoJackpot", 0);
  const num = Math.floor(Number(value) || 0);
  return num > 0 ? num : 0;
}

export async function setCasinoJackpot(valueInt) {
  const next = Math.max(0, Math.floor(Number(valueInt) || 0));
  await setSetting("_casinoJackpot", next);
  return next;
}

export async function incrementCasinoJackpot(deltaInt) {
  const delta = Math.max(0, Math.floor(Number(deltaInt) || 0));
  if (!delta) return getCasinoJackpot();

  await db.run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = CAST(COALESCE(CAST(settings.value AS INTEGER), 0) + ? AS TEXT)",
    "_casinoJackpot",
    String(delta),
    delta,
  );

  const row = await db.get(
    "SELECT value FROM settings WHERE key = ?",
    "_casinoJackpot",
  );
  const current = row ? Math.floor(Number(JSON.parse(row.value)) || 0) : 0;
  return current > 0 ? current : 0;
}

// ── Dashboard helpers (admin DB view) ───────────────────────────────────

export async function listDbTables() {
  ensureDb();
  const rows = await db.all(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return rows.map((r) => r.name);
}

export async function getDbTableRows(table, limit = 50, offset = 0) {
  ensureDb();
  const tables = await listDbTables();
  if (!tables.includes(table)) {
    throw new Error("Unknown table");
  }
  const size = Math.max(1, Math.min(200, Number(limit) || 50));
  const skip = Math.max(0, Math.floor(Number(offset) || 0));
  const columns = await db.all(`PRAGMA table_info("${table}")`);
  const rows = await db.all(
    `SELECT * FROM "${table}" LIMIT ? OFFSET ?`,
    size,
    skip,
  );
  return {
    columns: columns.map((col) => col.name),
    rows,
    limit: size,
    offset: skip,
  };
}

export async function executeDbSql(sql, params = []) {
  ensureDb();
  const trimmed = String(sql ?? "").trim();
  if (!trimmed) {
    throw new Error("SQL is empty");
  }
  const isSelect = /^select\b/i.test(trimmed);
  if (isSelect) {
    const rows = await db.all(trimmed, params);
    return { rows };
  }
  const res = await db.run(trimmed, params);
  return { changes: res.changes ?? 0, lastId: res.lastID ?? null };
}
