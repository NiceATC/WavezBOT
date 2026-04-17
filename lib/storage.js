// lib/storage.js
// SQLite storage wrapper — uses multi-database system

import { initStorageMulti, getDbForTable } from "./storage-multi.js";

export async function initStorage() {
  await initStorageMulti();
}

function getDb(tableName) {
  return getDbForTable(tableName);
}

function isRoomBotId(userId) {
  return String(userId ?? "").startsWith("room-bot:");
}

// ── Users (unified profile) ────────────────────────────────────────────────

export async function ensureUser(userId, identity = {}) {
  const uid = String(userId ?? "").trim();
  if (!uid || uid.startsWith("room-bot:")) return;

  const username =
    identity.username ??
    identity.userName ??
    identity.handle ??
    identity.login ??
    null;
  const displayName =
    identity.displayUsername ??
    identity.displayName ??
    identity.display_name ??
    identity.name ??
    identity.nickname ??
    identity.nick ??
    null;

  const db = getDb("users");
  const now = Date.now();
  db.prepare(
    `
    INSERT INTO users (user_id, username, display_name, first_seen_at, last_seen_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      username     = COALESCE(excluded.username, users.username),
      display_name = COALESCE(excluded.display_name, users.display_name),
      last_seen_at = excluded.last_seen_at,
      updated_at   = excluded.updated_at
  `,
  ).run(uid, username, displayName, now, now, now);
}

export async function getUser(userId) {
  const db = getDb("users");
  return db
    .prepare("SELECT * FROM users WHERE user_id = ?")
    .get(String(userId));
}

// ── Settings
export async function setSetting(key, value) {
  const db = getDb("settings");
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    key,
    JSON.stringify(value),
  );
}

export async function getSetting(key, fallback = null) {
  const db = getDb("settings");
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? JSON.parse(row.value) : fallback;
}

export async function getAllSettings() {
  const db = getDb("settings");
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const out = {};
  for (const row of rows) {
    out[row.key] = JSON.parse(row.value);
  }
  return out;
}

// Blacklist
export async function addBlacklist(type, value) {
  const db = getDb("blacklist");
  db.prepare("INSERT OR IGNORE INTO blacklist (type, value) VALUES (?, ?)").run(
    type,
    value,
  );
}

export async function removeBlacklist(type, value) {
  const db = getDb("blacklist");
  db.prepare("DELETE FROM blacklist WHERE type = ? AND value = ?").run(
    type,
    value,
  );
}

export async function getBlacklist(type) {
  const db = getDb("blacklist");
  const rows = db
    .prepare("SELECT value FROM blacklist WHERE type = ?")
    .all(type);
  return rows.map((r) => r.value);
}

// Track blacklist
export async function addTrackBlacklist(entry) {
  const db = getDb("track_blacklist");
  db.prepare(
    "INSERT OR REPLACE INTO track_blacklist (track_id, source, source_id, title, artist, added_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    entry.trackId,
    entry.source,
    entry.sourceId,
    entry.title,
    entry.artist,
    entry.addedAt ?? Date.now(),
  );
}

export async function removeTrackBlacklist(trackId) {
  const db = getDb("track_blacklist");
  db.prepare("DELETE FROM track_blacklist WHERE track_id = ?").run(trackId);
}

export async function getTrackBlacklist(trackId) {
  const db = getDb("track_blacklist");
  return db
    .prepare("SELECT * FROM track_blacklist WHERE track_id = ?")
    .get(trackId);
}

export async function listTrackBlacklist(limit = 20) {
  const db = getDb("track_blacklist");
  return db
    .prepare("SELECT * FROM track_blacklist ORDER BY added_at DESC LIMIT ?")
    .all(limit);
}

// Waitlist snapshot
function normalizeSnapshotEntry(entry) {
  const userId =
    entry?.userId ?? entry?.internalId ?? entry?.id ?? entry?.user_id ?? null;
  if (userId == null) return null;
  const position = Number(entry?.position ?? entry?.index + 1 ?? 0);
  if (!Number.isFinite(position) || position < 1) return null;
  return {
    userId: String(userId),
    publicId:
      entry?.publicId != null || entry?.id != null
        ? String(entry.publicId ?? entry.id)
        : null,
    username: entry?.username ?? null,
    displayName:
      entry?.displayName ?? entry?.display_name ?? entry?.username ?? null,
    position,
    isCurrentDj: Boolean(entry?.isCurrentDj),
  };
}

export async function upsertWaitlistSnapshot(entries, options = {}) {
  if (!Array.isArray(entries)) return;
  const db = getDb("waitlist_state");
  const roomSlug = options.roomSlug != null ? String(options.roomSlug) : null;
  const roomId = options.roomId != null ? String(options.roomId) : null;
  const source = options.source != null ? String(options.source) : "unknown";
  const now = Number(options.timestamp) || Date.now();
  const normalized = entries
    .map(normalizeSnapshotEntry)
    .filter((entry) => entry && entry.userId);

  const stmt = db.prepare(`INSERT INTO waitlist_state (
    room_slug, room_id, user_id, public_id, username, display_name,
    position, queue_length, is_current_dj, last_seen_at, source, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET
    room_slug = excluded.room_slug,
    room_id = excluded.room_id,
    public_id = COALESCE(excluded.public_id, waitlist_state.public_id),
    username = COALESCE(excluded.username, waitlist_state.username),
    display_name = COALESCE(excluded.display_name, waitlist_state.display_name),
    position = excluded.position,
    queue_length = excluded.queue_length,
    is_current_dj = excluded.is_current_dj,
    last_left_at = NULL,
    last_seen_at = excluded.last_seen_at,
    source = excluded.source,
    updated_at = excluded.updated_at`);

  for (const entry of normalized) {
    stmt.run(
      roomSlug,
      roomId,
      entry.userId,
      entry.publicId,
      entry.username,
      entry.displayName,
      entry.position,
      normalized.length,
      entry.isCurrentDj ? 1 : 0,
      now,
      source,
      now,
    );
  }

  if (roomSlug && options.markMissingLeft !== false && normalized.length > 0) {
    const placeholders = normalized.map(() => "?").join(",");
    db.prepare(
      `UPDATE waitlist_state SET last_left_at = ? WHERE room_slug = ? AND user_id NOT IN (${placeholders})`,
    ).run(now, roomSlug, ...normalized.map((e) => e.userId));
  }
}

export async function findWaitlistSnapshotByIdentity(userId, options = {}) {
  const db = getDb("waitlist_state");
  const roomSlug = options?.roomSlug != null ? String(options.roomSlug) : null;
  const query = roomSlug
    ? "SELECT * FROM waitlist_state WHERE user_id = ? AND room_slug = ? ORDER BY updated_at DESC LIMIT 1"
    : "SELECT * FROM waitlist_state WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1";
  const params = roomSlug ? [userId, roomSlug] : [userId];
  return db.prepare(query).get(...params);
}

export async function getWaitlistSnapshot(options = {}) {
  const db = getDb("waitlist_state");
  const roomSlug = options?.roomSlug != null ? String(options.roomSlug) : null;
  let query = "SELECT * FROM waitlist_state";
  const params = [];
  if (roomSlug) {
    query += " WHERE room_slug = ?";
    params.push(roomSlug);
  }
  query += " ORDER BY position ASC";
  return db.prepare(query).all(...params);
}

export async function markWaitlistUserLeft(userId, options = {}) {
  const db = getDb("waitlist_state");
  const roomSlug = options?.roomSlug != null ? String(options.roomSlug) : null;
  const now = Date.now();
  const query = roomSlug
    ? "UPDATE waitlist_state SET last_left_at = ? WHERE user_id = ? AND room_slug = ?"
    : "UPDATE waitlist_state SET last_left_at = ? WHERE user_id = ?";
  const params = roomSlug ? [now, userId, roomSlug] : [now, userId];
  db.prepare(query).run(...params);
}

// Greet state
export async function markGreeted(userId) {
  if (userId == null || isRoomBotId(userId)) return;
  const db = getDb("greet_state");
  const now = Date.now();
  db.prepare(
    `INSERT INTO greet_state (user_id, greeted_at, greeted_count) VALUES (?, ?, 1)
     ON CONFLICT(user_id) DO UPDATE SET greeted_at = ?, greeted_count = greeted_count + 1`,
  ).run(userId, now, now);
}

export async function getGreetState(userId) {
  if (userId == null || isRoomBotId(userId)) return null;
  const db = getDb("greet_state");
  return db.prepare("SELECT * FROM greet_state WHERE user_id = ?").get(userId);
}

export async function upsertGreetState({ userId, greetedAt, greetedCount }) {
  if (userId == null || isRoomBotId(userId)) return;
  const db = getDb("greet_state");
  db.prepare(
    `INSERT INTO greet_state (user_id, greeted_at, greeted_count)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET greeted_at = excluded.greeted_at, greeted_count = excluded.greeted_count`,
  ).run(userId, greetedAt ?? Date.now(), greetedCount ?? 1);
}

// AFK state
export async function listAfkState() {
  const db = getDb("afk_state");
  return db.prepare("SELECT * FROM afk_state").all();
}

export async function upsertAfkStateBatch(entries) {
  if (!Array.isArray(entries) || !entries.length) return;
  const db = getDb("afk_state");
  for (const entry of entries) {
    const userId = entry?.userId ?? entry?.user_id ?? null;
    if (userId == null || isRoomBotId(userId)) continue;
    db.prepare(
      `INSERT INTO afk_state (user_id, last_chat_at, last_join_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        last_chat_at = excluded.last_chat_at,
        last_join_at = excluded.last_join_at,
        updated_at = excluded.updated_at`,
    ).run(
      userId,
      entry.lastChatAt ?? entry.last_chat_at ?? 0,
      entry.lastJoinAt ?? entry.last_join_at ?? 0,
      entry.updatedAt ?? entry.updated_at ?? Date.now(),
    );
  }
}

// ── Economy balance ────────────────────────────────────────────────────────

export async function getEconomyBalance(userId) {
  const db = getDb("users");
  const row = db
    .prepare("SELECT balance FROM users WHERE user_id = ?")
    .get(userId);
  return row?.balance ?? 0;
}

export async function setEconomyBalance(userId, balance, identity = {}) {
  await ensureUser(userId, identity);
  const db = getDb("users");
  db.prepare(
    "UPDATE users SET balance = ?, updated_at = ? WHERE user_id = ?",
  ).run(balance, Date.now(), userId);
}

export async function listEconomyTop(limit = 10) {
  const db = getDb("users");
  return db
    .prepare(
      `SELECT
        user_id AS userId,
        username,
        display_name AS displayName,
        balance
      FROM users
      WHERE balance > 0
      ORDER BY balance DESC
      LIMIT ?`,
    )
    .all(limit);
}

// ── XP state ───────────────────────────────────────────────────────────────

export async function getXpState(userId) {
  const db = getDb("users");
  const row = db
    .prepare(
      `SELECT
        user_id AS userId,
        username,
        display_name AS displayName,
        level,
        xp,
        xp_total AS xpTotal,
        updated_at AS updatedAt
      FROM users WHERE user_id = ?`,
    )
    .get(userId);
  if (!row) return null;
  return row;
}

export async function setXpState({
  userId,
  level = 1,
  xp = 0,
  xpTotal = 0,
  username = null,
  displayName = null,
} = {}) {
  if (userId == null) return;
  await ensureUser(userId, { username, displayName });
  const db = getDb("users");
  db.prepare(
    "UPDATE users SET level = ?, xp = ?, xp_total = ?, updated_at = ? WHERE user_id = ?",
  ).run(level, xp, xpTotal, Date.now(), userId);
}

// ── VIP state ──────────────────────────────────────────────────────────────

export async function getVipState(userId) {
  const db = getDb("users");
  const row = db
    .prepare(
      `SELECT
        vip_level AS level,
        vip_expires_at AS expiresAt,
        vip_auto_renew AS autoRenew,
        vip_renew_level_key AS renewLevelKey,
        vip_renew_duration_key AS renewDurationKey
      FROM users
      WHERE user_id = ?`,
    )
    .get(userId);
  if (!row) return null;
  return {
    level: Number(row.level ?? 0) || 0,
    expiresAt: Number(row.expiresAt ?? 0) || 0,
    autoRenew: Number(row.autoRenew ?? 0) === 1,
    renewLevelKey: row.renewLevelKey ?? null,
    renewDurationKey: row.renewDurationKey ?? null,
  };
}

export async function setVipState({
  userId,
  level = 0,
  expiresAt = 0,
  autoRenew = null,
  renewLevelKey = null,
  renewDurationKey = null,
  username = null,
  displayName = null,
} = {}) {
  if (userId == null) return;
  await ensureUser(userId, { username, displayName });
  const db = getDb("users");
  const current = (await getVipState(userId)) ?? {};
  const nextAutoRenew =
    autoRenew == null ? (current.autoRenew ? 1 : 0) : autoRenew ? 1 : 0;
  const nextRenewLevelKey =
    renewLevelKey == null ? (current.renewLevelKey ?? null) : renewLevelKey;
  const nextRenewDurationKey =
    renewDurationKey == null
      ? (current.renewDurationKey ?? null)
      : renewDurationKey;
  db.prepare(
    "UPDATE users SET vip_level = ?, vip_expires_at = ?, vip_auto_renew = ?, vip_renew_level_key = ?, vip_renew_duration_key = ?, updated_at = ? WHERE user_id = ?",
  ).run(
    level,
    expiresAt,
    nextAutoRenew,
    nextRenewLevelKey,
    nextRenewDurationKey,
    Date.now(),
    userId,
  );
}

export async function setVipRenewalSettings({
  userId,
  autoRenew = null,
  renewLevelKey = null,
  renewDurationKey = null,
  username = null,
  displayName = null,
} = {}) {
  if (userId == null) return;
  const current = (await getVipState(userId)) ?? {};
  await setVipState({
    userId,
    level: Number(current.level ?? 0) || 0,
    expiresAt: Number(current.expiresAt ?? 0) || 0,
    autoRenew,
    renewLevelKey,
    renewDurationKey,
    username,
    displayName,
  });
}

export async function getVipGreetMessage(userId) {
  const db = getDb("users");
  const row = db
    .prepare(
      "SELECT vip_greet_message AS greetMessage FROM users WHERE user_id = ?",
    )
    .get(userId);
  return row?.greetMessage ? String(row.greetMessage) : null;
}

export async function setVipGreetMessage({
  userId,
  greetMessage = null,
  username = null,
  displayName = null,
} = {}) {
  if (userId == null) return;
  await ensureUser(userId, { username, displayName });
  const db = getDb("users");
  const normalized =
    greetMessage == null || String(greetMessage).trim() === ""
      ? null
      : String(greetMessage).trim();
  db.prepare(
    "UPDATE users SET vip_greet_message = ?, updated_at = ? WHERE user_id = ?",
  ).run(normalized, Date.now(), userId);
}

export async function applyVipPurchase({
  userId,
  level = 0,
  durationMs = 0,
  autoRenew = null,
  renewLevelKey = null,
  renewDurationKey = null,
  username = null,
  displayName = null,
} = {}) {
  if (userId == null) return { ok: false, code: "invalid_user" };
  const nextLevel = Math.max(0, Math.floor(Number(level) || 0));
  const deltaMs = Math.max(0, Math.floor(Number(durationMs) || 0));
  if (nextLevel <= 0 || deltaMs <= 0) {
    return { ok: false, code: "invalid_purchase" };
  }

  const now = Date.now();
  const current = (await getVipState(userId)) ?? { level: 0, expiresAt: 0 };
  const currentLevel = Number(current.level ?? 0) || 0;
  const currentExpiresAt = Number(current.expiresAt ?? 0) || 0;
  const isActive = currentLevel > 0 && currentExpiresAt > now;
  const activeLevel = isActive ? currentLevel : 0;

  if (isActive && activeLevel > nextLevel) {
    return {
      ok: false,
      code: "higher_level_active",
      currentLevel: activeLevel,
      currentExpiresAt,
    };
  }

  const startAt = isActive ? currentExpiresAt : now;
  const finalLevel = Math.max(activeLevel, nextLevel);
  const finalExpiresAt = startAt + deltaMs;

  await setVipState({
    userId,
    level: finalLevel,
    expiresAt: finalExpiresAt,
    autoRenew,
    renewLevelKey,
    renewDurationKey,
    username,
    displayName,
  });

  return {
    ok: true,
    previousLevel: activeLevel,
    level: finalLevel,
    expiresAt: finalExpiresAt,
    addedMs: deltaMs,
  };
}

export async function listXpTop(limit = 10) {
  const db = getDb("users");
  return db
    .prepare(
      `SELECT
        user_id AS userId,
        username,
        display_name AS displayName,
        level,
        xp,
        xp_total AS xpTotal
      FROM users
      ORDER BY level DESC, xp DESC
      LIMIT ?`,
    )
    .all(limit);
}

// ── Daily reward ───────────────────────────────────────────────────────────

export async function getDailyRewardState(userId) {
  const db = getDb("users");
  const row = db
    .prepare(
      `SELECT
        daily_last_claim_at AS lastClaimAt,
        daily_streak AS streak
      FROM users WHERE user_id = ?`,
    )
    .get(userId);
  if (!row) return null;
  return row;
}

export async function setDailyRewardState({
  userId,
  lastClaimAt = 0,
  streak = 0,
} = {}) {
  if (userId == null) return;
  const db = getDb("users");
  await ensureUser(userId);
  db.prepare(
    "UPDATE users SET daily_last_claim_at = ?, daily_streak = ?, updated_at = ? WHERE user_id = ?",
  ).run(lastClaimAt, streak, Date.now(), userId);
}

// ── Work state ─────────────────────────────────────────────────────────────

export async function getWorkState(userId) {
  const db = getDb("users");
  const row = db
    .prepare(
      `SELECT
        work_job_key AS jobKey,
        work_last_claim_at AS lastClaimAt
      FROM users WHERE user_id = ?`,
    )
    .get(userId);
  if (!row) return null;
  return row;
}

export async function setWorkState({
  userId,
  jobKey = null,
  lastClaimAt = 0,
} = {}) {
  if (userId == null) return;
  const db = getDb("users");
  await ensureUser(userId);
  db.prepare(
    "UPDATE users SET work_job_key = ?, work_last_claim_at = ?, updated_at = ? WHERE user_id = ?",
  ).run(jobKey, lastClaimAt, Date.now(), userId);
}

// Shop purchases
export async function getShopPurchase(userId, itemKey) {
  const db = getDb("shop_purchases");
  return db
    .prepare("SELECT * FROM shop_purchases WHERE user_id = ? AND item_key = ?")
    .get(userId, itemKey);
}

export async function addShopPurchase(userId, itemKey, quantity = 1) {
  const db = getDb("shop_purchases");
  db.prepare(
    `INSERT INTO shop_purchases (user_id, item_key, quantity, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, item_key) DO UPDATE SET
       quantity = quantity + excluded.quantity,
       updated_at = excluded.updated_at`,
  ).run(userId, itemKey, quantity, Date.now());
}

// User rewards
export async function addUserReward(userId, type, rewardKey, level = 1) {
  const db = getDb("user_rewards");
  db.prepare(
    `INSERT INTO user_rewards (user_id, type, reward_key, level, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, type, reward_key) DO UPDATE SET level = excluded.level`,
  ).run(userId, type, rewardKey, level, Date.now());
}

export async function getUserReward(userId, type, rewardKey) {
  const db = getDb("user_rewards");
  return db
    .prepare(
      "SELECT * FROM user_rewards WHERE user_id = ? AND type = ? AND reward_key = ?",
    )
    .get(userId, type, rewardKey);
}

// Track history
export async function addTrackHistory(track, djId, djName) {
  const db = getDb("track_history");
  db.prepare(
    `INSERT INTO track_history (track_id, title, artist, dj_id, dj_name, played_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    track.sourceId ?? track.youtubeId ?? null,
    track.title ?? null,
    track.artist ?? null,
    djId ?? null,
    djName ?? null,
    Date.now(),
  );
}

export async function listTrackHistory(limit = 20) {
  const db = getDb("track_history");
  return db
    .prepare("SELECT * FROM track_history ORDER BY played_at DESC LIMIT ?")
    .all(limit);
}

// ── User stats ─────────────────────────────────────────────────────────────

export async function incrementUserWoot(userId, identity = {}) {
  await ensureUser(userId, identity);
  const db = getDb("users");
  db.prepare(
    "UPDATE users SET woots = woots + 1, updated_at = ? WHERE user_id = ?",
  ).run(Date.now(), userId);
}

export async function incrementUserDjPlay(userId, identity = {}) {
  await ensureUser(userId, identity);
  const db = getDb("users");
  db.prepare(
    "UPDATE users SET dj_plays = dj_plays + 1, updated_at = ? WHERE user_id = ?",
  ).run(Date.now(), userId);
}

export async function listTopWootUsers(limit = 10) {
  const db = getDb("users");
  return db
    .prepare(
      `SELECT
        user_id AS userId,
        username,
        display_name AS displayName,
        woots
      FROM users
      WHERE woots > 0
      ORDER BY woots DESC
      LIMIT ?`,
    )
    .all(limit);
}

export async function getUserWootRank(userId) {
  const db = getDb("users");
  const row = db
    .prepare("SELECT woots FROM users WHERE user_id = ?")
    .get(userId);
  if (!row || !row.woots) return null;
  const rankRow = db
    .prepare("SELECT COUNT(*) AS rank FROM users WHERE woots > ?")
    .get(row.woots);
  return { count: row.woots, rank: (rankRow?.rank ?? 0) + 1 };
}

export async function getUserDjRank(userId) {
  const db = getDb("users");
  const row = db
    .prepare("SELECT dj_plays FROM users WHERE user_id = ?")
    .get(userId);
  if (!row || !row.dj_plays) return null;
  const rankRow = db
    .prepare("SELECT COUNT(*) AS rank FROM users WHERE dj_plays > ?")
    .get(row.dj_plays);
  return { count: row.dj_plays, rank: (rankRow?.rank ?? 0) + 1 };
}

// Song stats
export async function incrementSongPlay(track) {
  const db = getDb("song_stats");
  const now = Date.now();
  db.prepare(
    `INSERT INTO song_stats (track_id, source, source_id, title, artist, plays, woots, updated_at, last_played_at)
     VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)
     ON CONFLICT(track_id) DO UPDATE SET
       plays = plays + 1,
       updated_at = excluded.updated_at,
       last_played_at = excluded.last_played_at`,
  ).run(
    track.sourceId ?? track.youtubeId ?? null,
    track.source ?? null,
    track.sourceId ?? track.youtubeId ?? null,
    track.title ?? null,
    track.artist ?? null,
    now,
    now,
  );
}

export async function incrementSongWoot(track) {
  const db = getDb("song_stats");
  db.prepare(
    `INSERT INTO song_stats (track_id, source, source_id, title, artist, plays, woots, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, 1, ?)
     ON CONFLICT(track_id) DO UPDATE SET woots = woots + 1, updated_at = excluded.updated_at`,
  ).run(
    track.sourceId ?? track.youtubeId ?? null,
    track.source ?? null,
    track.sourceId ?? track.youtubeId ?? null,
    track.title ?? null,
    track.artist ?? null,
    Date.now(),
  );
}

// ── Casino jackpot ─────────────────────────────────────────────────────────

export async function getCasinoJackpot() {
  const db = getDb("settings");
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get("casino_jackpot");
  return row ? Number(row.value) : 0;
}

export async function setCasinoJackpot(amount) {
  const db = getDb("settings");
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    "casino_jackpot",
    String(amount),
  );
}

export async function incrementCasinoJackpot(amount) {
  const current = await getCasinoJackpot();
  await setCasinoJackpot(current + amount);
}

// Leaderboard reset
export async function getLeaderboardResetAt() {
  const db = getDb("settings");
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get("leaderboard_reset_at");
  return row ? Number(row.value) : 0;
}

export async function setLeaderboardResetAt(timestamp) {
  const db = getDb("settings");
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    "leaderboard_reset_at",
    String(timestamp),
  );
}

export async function resetLeaderboards() {
  getDb("users").prepare("UPDATE users SET woots = 0, dj_plays = 0").run();
  getDb("song_stats").prepare("DELETE FROM song_stats").run();
}

// ── Top DJ users ───────────────────────────────────────────────────────────

export async function listTopDjUsers(limit = 10) {
  const db = getDb("users");
  return db
    .prepare(
      `SELECT
        user_id AS userId,
        username,
        display_name AS displayName,
        dj_plays AS djPlays
      FROM users
      WHERE dj_plays > 0
      ORDER BY dj_plays DESC
      LIMIT ?`,
    )
    .all(limit);
}

// ── Top songs ──────────────────────────────────────────────────────────────

export async function listTopSongs(limit = 10) {
  const db = getDb("song_stats");
  return db
    .prepare("SELECT * FROM song_stats ORDER BY plays DESC LIMIT ?")
    .all(limit);
}

// ── Dashboard DB utilities ─────────────────────────────────────────────────

import { getDbForTable as _getDbForTable } from "./storage-multi.js";

const _ALL_TABLES = [
  "settings",
  "users",
  "blacklist",
  "track_blacklist",
  "shop_purchases",
  "user_rewards",
  "waitlist_state",
  "greet_state",
  "afk_state",
  "track_history",
  "song_stats",
];

export async function listDbTables() {
  return _ALL_TABLES;
}

export async function getDbTableRows(tableName, limit = 100) {
  const db = _getDbForTable(tableName);
  return db.prepare(`SELECT * FROM ${tableName} LIMIT ?`).all(limit);
}

export async function executeDbSql(sql) {
  // Only allow SELECT statements for security
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith("SELECT")) {
    throw new Error("Only SELECT statements are allowed");
  }
  // Determine which DB to use by scanning for known table names
  const tableMatch = _ALL_TABLES.find((t) =>
    sql.toLowerCase().includes(t.toLowerCase()),
  );
  if (!tableMatch) {
    throw new Error("Could not determine target database from SQL");
  }
  const db = _getDbForTable(tableMatch);
  return db.prepare(sql).all();
}
