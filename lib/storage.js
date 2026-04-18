// lib/storage.js
// SQLite storage wrapper — uses multi-database system

import {
  initStorageMulti,
  getDbForTable,
  getDbCatalog,
  getTableToDbMap,
} from "./storage-multi.js";

export async function initStorage() {
  await initStorageMulti();
}

function getDb(tableName) {
  return getDbForTable(tableName);
}

function isRoomBotId(userId) {
  return String(userId ?? "").startsWith("room-bot:");
}

function isValidUserId(userId) {
  const uid = String(userId ?? "").trim();
  if (!uid) return false;
  if (uid.startsWith("room-bot:")) return false;
  // Block common ghost/system pseudo IDs.
  if (/^(system|unknown|null|undefined|guest)$/i.test(uid)) return false;
  // Accept numeric IDs and UUID-like IDs used by Wavez.
  return /^\d+$/.test(uid) || /^[a-z0-9-]{8,64}$/i.test(uid);
}

// ── Users (unified profile) ────────────────────────────────────────────────

export async function ensureUser(userId, identity = {}) {
  const uid = String(userId ?? "").trim();
  // Accept real user IDs (numeric and UUID-like), but block ghost/system IDs.
  if (!isValidUserId(uid)) return;

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

// ── Moderation warnings ───────────────────────────────────────────────────

export async function addWarning(entry) {
  const db = getDb("warnings");
  const now = Date.now();
  db.prepare(
    `INSERT INTO warnings (
      user_id, moderator_user_id, reason, source, created_at, expires_at, cleared_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
  ).run(
    String(entry?.userId ?? ""),
    entry?.moderatorUserId != null ? String(entry.moderatorUserId) : null,
    entry?.reason != null ? String(entry.reason) : null,
    entry?.source != null ? String(entry.source) : null,
    Number(entry?.createdAt ?? now) || now,
    entry?.expiresAt != null ? Number(entry.expiresAt) || null : null,
  );
}

export async function clearWarnings(userId) {
  const db = getDb("warnings");
  const now = Date.now();
  db.prepare(
    "UPDATE warnings SET cleared_at = ? WHERE user_id = ? AND cleared_at IS NULL",
  ).run(now, String(userId));
}

export async function listWarnings(userId, options = {}) {
  const db = getDb("warnings");
  const now = Date.now();
  const includeExpired = options?.includeExpired === true;
  const query = includeExpired
    ? `SELECT * FROM warnings WHERE user_id = ? AND cleared_at IS NULL ORDER BY created_at DESC`
    : `SELECT * FROM warnings WHERE user_id = ? AND cleared_at IS NULL AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC`;
  return includeExpired
    ? db.prepare(query).all(String(userId))
    : db.prepare(query).all(String(userId), now);
}

export async function listWarningsForModeration(options = {}) {
  const db = getDb("warnings");
  const usersDb = getDb("users");
  const now = Date.now();
  const limit = Math.max(
    1,
    Math.min(500, Number(options?.limit ?? 100) || 100),
  );
  const userId = String(options?.userId ?? "").trim();
  const includeExpired = options?.includeExpired === true;

  let rows = [];
  if (userId) {
    const sql = includeExpired
      ? `
        SELECT *
        FROM warnings
        WHERE user_id = ? AND cleared_at IS NULL
        ORDER BY created_at DESC
        LIMIT ?
      `
      : `
        SELECT *
        FROM warnings
        WHERE user_id = ?
          AND cleared_at IS NULL
          AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY created_at DESC
        LIMIT ?
      `;
    rows = includeExpired
      ? db.prepare(sql).all(userId, limit)
      : db.prepare(sql).all(userId, now, limit);
  } else {
    const sql = includeExpired
      ? `
        SELECT *
        FROM warnings
        WHERE cleared_at IS NULL
        ORDER BY created_at DESC
        LIMIT ?
      `
      : `
        SELECT *
        FROM warnings
        WHERE cleared_at IS NULL
          AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY created_at DESC
        LIMIT ?
      `;
    rows = includeExpired
      ? db.prepare(sql).all(limit)
      : db.prepare(sql).all(now, limit);
  }

  if (!rows.length) return [];

  const ids = new Set();
  for (const row of rows) {
    if (row?.user_id != null) ids.add(String(row.user_id));
    if (row?.moderator_user_id != null) ids.add(String(row.moderator_user_id));
  }

  const usersMap = new Map();
  if (ids.size) {
    const placeholders = [...ids].map(() => "?").join(",");
    const users = usersDb
      .prepare(
        `SELECT user_id, username, display_name FROM users WHERE user_id IN (${placeholders})`,
      )
      .all(...ids);
    for (const u of users) usersMap.set(String(u.user_id), u);
  }

  return rows.map((row) => {
    const user = usersMap.get(String(row.user_id ?? ""));
    const moderator = usersMap.get(String(row.moderator_user_id ?? ""));
    return {
      ...row,
      username: user?.username ?? null,
      display_name: user?.display_name ?? null,
      moderator_username: moderator?.username ?? null,
      moderator_display_name: moderator?.display_name ?? null,
    };
  });
}

export async function deleteWarningById(warningId) {
  const db = getDb("warnings");
  const id = Number(warningId);
  if (!Number.isFinite(id) || id <= 0) return false;
  const info = db.prepare("DELETE FROM warnings WHERE id = ?").run(id);
  return Number(info?.changes ?? 0) > 0;
}

export async function listUsersForModeration(options = {}) {
  const db = getDb("users");
  const warnDb = getDb("warnings");
  const limit = Math.max(
    1,
    Math.min(1000, Number(options?.limit ?? 300) || 300),
  );
  const search = String(options?.search ?? "")
    .trim()
    .toLowerCase();

  let users = [];
  if (search) {
    users = db
      .prepare(
        `
        SELECT
          u.user_id,
          u.username,
          u.display_name,
          u.level,
          u.balance,
          u.last_seen_at,
          u.updated_at,
          u.chat_count
        FROM users u
        WHERE lower(COALESCE(u.username, '')) LIKE ?
           OR lower(COALESCE(u.display_name, '')) LIKE ?
           OR lower(COALESCE(u.user_id, '')) LIKE ?
        ORDER BY u.last_seen_at DESC
        LIMIT ?
      `,
      )
      .all(`%${search}%`, `%${search}%`, `%${search}%`, limit);
  } else {
    users = db
      .prepare(
        `
        SELECT
          u.user_id,
          u.username,
          u.display_name,
          u.level,
          u.balance,
          u.last_seen_at,
          u.updated_at,
          u.chat_count
        FROM users u
        ORDER BY u.last_seen_at DESC
        LIMIT ?
      `,
      )
      .all(limit);
  }

  if (!users.length) return [];

  const ids = users.map((u) => String(u.user_id));
  const placeholders = ids.map(() => "?").join(",");
  const now = Date.now();
  const warnRows = warnDb
    .prepare(
      `
      SELECT user_id, COUNT(*) AS count
      FROM warnings
      WHERE cleared_at IS NULL
        AND (expires_at IS NULL OR expires_at > ?)
        AND user_id IN (${placeholders})
      GROUP BY user_id
    `,
    )
    .all(now, ...ids);
  const warnMap = new Map(
    warnRows.map((row) => [String(row.user_id), Number(row.count ?? 0) || 0]),
  );

  return users.map((u) => ({
    ...u,
    active_warnings: warnMap.get(String(u.user_id)) ?? 0,
  }));
}

export async function getActiveWarningCount(userId) {
  const db = getDb("warnings");
  const now = Date.now();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM warnings
       WHERE user_id = ?
         AND cleared_at IS NULL
         AND (expires_at IS NULL OR expires_at > ?)`,
    )
    .get(String(userId), now);
  return Number(row?.count ?? 0) || 0;
}

// ── Economy bank ──────────────────────────────────────────────────────────

export async function getBankBalance(userId) {
  const db = getDb("bank_accounts");
  const row = db
    .prepare("SELECT balance FROM bank_accounts WHERE user_id = ?")
    .get(String(userId));
  return Number(row?.balance ?? 0) || 0;
}

/**
 * Marks the user as online for bank interest eligibility.
 * Should be called whenever the user sends a message or joins.
 */
export async function touchBankOnlineAt(userId) {
  const db = getDb("bank_accounts");
  const row = db
    .prepare("SELECT balance FROM bank_accounts WHERE user_id = ?")
    .get(String(userId));
  if (!row) return; // no account, nothing to update
  db.prepare(
    `UPDATE bank_accounts SET last_online_at = ? WHERE user_id = ?`,
  ).run(Date.now(), String(userId));
}

/**
 * Applies daily bank interest (lazy accrual) with optional risk.
 * Interest only accrues for days the user was seen online.
 * @param {string} userId
 * @param {object} opts
 * @param {number} opts.ratePerDay       – e.g. 0.01 for 1%/day
 * @param {number} opts.riskChance       – 0-1 probability of a loss event
 * @param {number} opts.riskLossMin      – min fraction to lose (0-1)
 * @param {number} opts.riskLossMax      – max fraction to lose (0-1)
 * @param {boolean} opts.riskTotalLoss   – if true, 100% loss is possible
 * @returns {{ balance: number, accrued: number, lost: number, wasOnline: boolean }}
 */
export async function applyBankDailyInterest(userId, opts = {}) {
  const db = getDb("bank_accounts");
  const row = db
    .prepare(
      "SELECT balance, last_online_at, updated_at FROM bank_accounts WHERE user_id = ?",
    )
    .get(String(userId));
  if (!row || !row.balance)
    return { balance: 0, accrued: 0, lost: 0, wasOnline: true };

  const now = Date.now();
  const DAY_MS = 86_400_000;
  const updatedAt = Number(row.updated_at) || now;
  const lastOnlineAt = Number(row.last_online_at) || 0;
  const daysElapsed = (now - updatedAt) / DAY_MS;
  if (daysElapsed < 1)
    return {
      balance: Number(row.balance),
      accrued: 0,
      lost: 0,
      wasOnline: true,
    };

  // User must have been online at least once since last accrual
  const wasOnline = lastOnlineAt >= updatedAt;
  const rate = Math.max(0, Number(opts.ratePerDay) || 0.01);
  let accrued = 0;
  if (wasOnline) {
    accrued = Math.floor(Number(row.balance) * rate * Math.floor(daysElapsed));
  }

  // Risk: apply before or after accrual
  let lost = 0;
  const riskChance = Math.max(0, Math.min(1, Number(opts.riskChance) || 0));
  if (riskChance > 0 && Math.random() < riskChance) {
    const totalLoss = opts.riskTotalLoss && Math.random() < 0.05;
    if (totalLoss) {
      lost = Number(row.balance) + accrued;
    } else {
      const lossMin = Math.max(
        0,
        Math.min(1, Number(opts.riskLossMin) || 0.05),
      );
      const lossMax = Math.max(
        lossMin,
        Math.min(1, Number(opts.riskLossMax) || 0.2),
      );
      const fraction = lossMin + Math.random() * (lossMax - lossMin);
      lost = Math.floor((Number(row.balance) + accrued) * fraction);
    }
  }

  const newBalance = Math.max(0, Number(row.balance) + accrued - lost);
  db.prepare(
    `UPDATE bank_accounts SET balance = ?, updated_at = ? WHERE user_id = ?`,
  ).run(newBalance, now, String(userId));

  return { balance: newBalance, accrued, lost, wasOnline };
}

export async function setBankBalance(userId, balance) {
  const db = getDb("bank_accounts");
  const now = Date.now();
  db.prepare(
    `INSERT INTO bank_accounts (user_id, balance, last_online_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       balance = excluded.balance,
       updated_at = excluded.updated_at`,
  ).run(
    String(userId),
    Math.max(0, Math.floor(Number(balance) || 0)),
    now,
    now,
  );
}

// ── Economy insurance (online-day based) ─────────────────────────────────

function todayDateKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

export async function getInsuranceDays(userId) {
  const db = getDb("user_insurance");
  const row = db
    .prepare("SELECT remaining_days FROM user_insurance WHERE user_id = ?")
    .get(String(userId));
  return Math.max(0, Number(row?.remaining_days ?? 0) || 0);
}

export async function addInsuranceDays(userId, days) {
  const db = getDb("user_insurance");
  const now = Date.now();
  db.prepare(
    `INSERT INTO user_insurance (user_id, remaining_days, last_seen_date, updated_at)
     VALUES (?, ?, '', ?)
     ON CONFLICT(user_id) DO UPDATE SET
       remaining_days = remaining_days + excluded.remaining_days,
       updated_at = excluded.updated_at`,
  ).run(String(userId), Math.max(0, Math.floor(Number(days) || 0)), now);
  return getInsuranceDays(userId);
}

/**
 * Consumes one insurance day if today is a new calendar day for this user.
 * Should be called whenever the user is seen online.
 * @returns {number} remaining days after potential consumption
 */
export async function touchInsuranceDay(userId) {
  const db = getDb("user_insurance");
  const row = db
    .prepare(
      "SELECT remaining_days, last_seen_date FROM user_insurance WHERE user_id = ?",
    )
    .get(String(userId));
  if (!row || row.remaining_days <= 0) return 0;

  const today = todayDateKey();
  if (row.last_seen_date === today) return Number(row.remaining_days);

  const next = Math.max(0, Number(row.remaining_days) - 1);
  db.prepare(
    `UPDATE user_insurance SET remaining_days = ?, last_seen_date = ?, updated_at = ? WHERE user_id = ?`,
  ).run(next, today, Date.now(), String(userId));
  return next;
}

export async function hasActiveInsurance(userId) {
  return (await getInsuranceDays(userId)) > 0;
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
    last_left_at = waitlist_state.last_left_at,
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

  // Primary: exact user_id match
  const exactQuery = roomSlug
    ? "SELECT * FROM waitlist_state WHERE user_id = ? AND room_slug = ? ORDER BY updated_at DESC LIMIT 1"
    : "SELECT * FROM waitlist_state WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1";
  const exactParams = roomSlug ? [userId, roomSlug] : [userId];
  const exact = db.prepare(exactQuery).get(...exactParams);
  if (exact) return exact;

  // Fallback: case-insensitive username match (handles cases where the caller
  // passes a display name or username and the stored user_id is a session
  // internalId).  Prefer rows with last_left_at set (most recent DC event).
  const usernameQuery = roomSlug
    ? "SELECT * FROM waitlist_state WHERE LOWER(username) = LOWER(?) AND room_slug = ? ORDER BY CASE WHEN last_left_at > 0 THEN 0 ELSE 1 END, last_left_at DESC, updated_at DESC LIMIT 1"
    : "SELECT * FROM waitlist_state WHERE LOWER(username) = LOWER(?) ORDER BY CASE WHEN last_left_at > 0 THEN 0 ELSE 1 END, last_left_at DESC, updated_at DESC LIMIT 1";
  const usernameParams = roomSlug ? [userId, roomSlug] : [userId];
  return db.prepare(usernameQuery).get(...usernameParams) ?? null;
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
  const username = options?.username != null ? String(options.username) : null;
  const now = Date.now();

  // Primary: update by exact user_id match
  const byIdQuery = roomSlug
    ? "UPDATE waitlist_state SET last_left_at = ? WHERE user_id = ? AND room_slug = ?"
    : "UPDATE waitlist_state SET last_left_at = ? WHERE user_id = ?";
  const byIdParams = roomSlug ? [now, userId, roomSlug] : [now, userId];
  const byIdResult = db.prepare(byIdQuery).run(...byIdParams);

  // Fallback: if no row matched and username is provided, update by username.
  // This handles the case where waitlist_state.user_id stores a session-scoped
  // internalId but the WS event carries the stable platform userId (UUID).
  if (byIdResult.changes === 0 && username) {
    const byUsernameQuery = roomSlug
      ? "UPDATE waitlist_state SET last_left_at = ? WHERE LOWER(username) = LOWER(?) AND room_slug = ?"
      : "UPDATE waitlist_state SET last_left_at = ? WHERE LOWER(username) = LOWER(?)";
    const byUsernameParams = roomSlug
      ? [now, username, roomSlug]
      : [now, username];
    db.prepare(byUsernameQuery).run(...byUsernameParams);
  }
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

export async function incrementChatCount(userId, identity = {}) {
  await ensureUser(userId, identity);
  const db = getDb("users");
  db.prepare(
    "UPDATE users SET chat_count = chat_count + 1, updated_at = ? WHERE user_id = ?",
  ).run(Date.now(), userId);
}

export async function incrementCasinoStat(userId, won) {
  // Ensure the user row exists before updating so the stat is never silently
  // dropped (the economy balance flush is deferred and may not have run yet).
  await ensureUser(userId);
  const db = getDb("users");
  if (won) {
    db.prepare(
      "UPDATE users SET casino_wins = casino_wins + 1, updated_at = ? WHERE user_id = ?",
    ).run(Date.now(), userId);
  } else {
    db.prepare(
      "UPDATE users SET casino_losses = casino_losses + 1, updated_at = ? WHERE user_id = ?",
    ).run(Date.now(), userId);
  }
}

export async function incrementEconomyEarned(userId, amountInt) {
  if (!amountInt || amountInt <= 0) return;
  const db = getDb("users");
  db.prepare(
    "UPDATE users SET total_earned = total_earned + ?, updated_at = ? WHERE user_id = ?",
  ).run(amountInt, Date.now(), userId);
}

export async function incrementEconomySpent(userId, amountInt) {
  if (!amountInt || amountInt <= 0) return;
  const db = getDb("users");
  db.prepare(
    "UPDATE users SET total_spent = total_spent + ?, updated_at = ? WHERE user_id = ?",
  ).run(amountInt, Date.now(), userId);
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

export async function listTopChatUsers(limit = 10) {
  const db = getDb("users");
  return db
    .prepare(
      `SELECT
        user_id AS userId,
        username,
        display_name AS displayName,
        chat_count AS chatCount
      FROM users
      WHERE chat_count > 0
      ORDER BY chat_count DESC
      LIMIT ?`,
    )
    .all(limit);
}

export async function listTopCasinoWinners(limit = 10) {
  const db = getDb("users");
  return db
    .prepare(
      `SELECT
        user_id AS userId,
        username,
        display_name AS displayName,
        casino_wins AS casinoWins,
        casino_losses AS casinoLosses
      FROM users
      WHERE casino_wins > 0
      ORDER BY casino_wins DESC
      LIMIT ?`,
    )
    .all(limit);
}

export async function listTopCasinoLosers(limit = 10) {
  const db = getDb("users");
  return db
    .prepare(
      `SELECT
        user_id AS userId,
        username,
        display_name AS displayName,
        casino_wins AS casinoWins,
        casino_losses AS casinoLosses
      FROM users
      WHERE casino_losses > 0
      ORDER BY casino_losses DESC
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

export async function listDbDatabases() {
  const catalog = getDbCatalog();
  const tableMap = getTableToDbMap();
  const byDb = new Map();

  for (const [table, dbKey] of Object.entries(tableMap)) {
    if (!byDb.has(dbKey)) byDb.set(dbKey, []);
    byDb.get(dbKey).push(table);
  }

  return Object.entries(catalog)
    .map(([key, filename]) => ({
      key,
      filename,
      tables: (byDb.get(key) || []).sort(),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function ensureSafeSqlIdent(name, kind = "identifier") {
  const raw = String(name ?? "").trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) {
    throw new Error(`Invalid ${kind}`);
  }
  return raw;
}

export async function getDbTableColumns(tableName) {
  const safeTable = ensureSafeSqlIdent(tableName, "table name");
  const db = _getDbForTable(safeTable);
  const rows = db.prepare(`PRAGMA table_info(${safeTable})`).all();
  return rows.map((row) => ({
    name: String(row?.name ?? ""),
    type: String(row?.type ?? ""),
    notnull: Number(row?.notnull ?? 0) === 1,
    pk: Number(row?.pk ?? 0) > 0,
    defaultValue: row?.dflt_value ?? null,
  }));
}

export async function getDbTableRows(tableName, limit = 100, offset = 0) {
  const safeTable = ensureSafeSqlIdent(tableName, "table name");
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const db = _getDbForTable(safeTable);

  const columns = await getDbTableColumns(safeTable);
  const rows = db
    .prepare(`SELECT * FROM ${safeTable} LIMIT ? OFFSET ?`)
    .all(safeLimit, safeOffset);
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS count FROM ${safeTable}`)
    .get();

  return {
    columns: columns.map((col) => col.name),
    columnMeta: columns,
    rows,
    table: safeTable,
    limit: safeLimit,
    offset: safeOffset,
    total: Number(totalRow?.count ?? rows.length) || 0,
  };
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

export async function updateDbTableRow(tableName, where, values) {
  const safeTable = ensureSafeSqlIdent(tableName, "table name");
  const db = _getDbForTable(safeTable);
  const columns = await getDbTableColumns(safeTable);
  const known = new Set(columns.map((col) => col.name));

  const whereObj = where && typeof where === "object" ? where : {};
  const valuesObj = values && typeof values === "object" ? values : {};

  const whereEntries = Object.entries(whereObj)
    .map(([key, val]) => [ensureSafeSqlIdent(key, "column name"), val])
    .filter(([key]) => known.has(key));
  const setEntries = Object.entries(valuesObj)
    .map(([key, val]) => [ensureSafeSqlIdent(key, "column name"), val])
    .filter(([key]) => known.has(key));

  if (!whereEntries.length) {
    throw new Error("Missing row selector");
  }
  if (!setEntries.length) {
    throw new Error("No fields to update");
  }

  const whereSql = whereEntries.map(([key]) => `${key} = ?`).join(" AND ");
  const setSql = setEntries.map(([key]) => `${key} = ?`).join(", ");
  const params = [
    ...setEntries.map(([, val]) => val),
    ...whereEntries.map(([, val]) => val),
  ];

  const info = db
    .prepare(`UPDATE ${safeTable} SET ${setSql} WHERE ${whereSql}`)
    .run(...params);

  return {
    changed: Number(info?.changes ?? 0) || 0,
  };
}

export async function deleteDbTableRow(tableName, where) {
  const safeTable = ensureSafeSqlIdent(tableName, "table name");
  const db = _getDbForTable(safeTable);
  const columns = await getDbTableColumns(safeTable);
  const known = new Set(columns.map((col) => col.name));

  const whereObj = where && typeof where === "object" ? where : {};
  const whereEntries = Object.entries(whereObj)
    .map(([key, val]) => [ensureSafeSqlIdent(key, "column name"), val])
    .filter(([key]) => known.has(key));

  if (!whereEntries.length) {
    throw new Error("Missing row selector");
  }

  const whereSql = whereEntries.map(([key]) => `${key} = ?`).join(" AND ");
  const params = whereEntries.map(([, val]) => val);
  const info = db
    .prepare(`DELETE FROM ${safeTable} WHERE ${whereSql}`)
    .run(...params);

  return {
    changed: Number(info?.changes ?? 0) || 0,
  };
}

// ── Overview / analytics ───────────────────────────────────────────────────

export async function getOverviewStats() {
  const usersDb = getDb("users");
  const econDb = getDb("shop_purchases");
  const blDb = getDb("warnings");
  const statsDb = getDb("track_history");
  const now = Date.now();
  const day7 = now - 7 * 24 * 60 * 60 * 1000;
  const day14 = now - 14 * 24 * 60 * 60 * 1000;
  const day30 = now - 30 * 24 * 60 * 60 * 1000;
  const day60 = now - 60 * 24 * 60 * 60 * 1000;

  // ── Users aggregate ──────────────────────────────────────────────────────
  const agg = usersDb
    .prepare(
      `
    SELECT
      COUNT(*)                                      AS totalUsers,
      SUM(balance)                                  AS totalBalance,
      AVG(CASE WHEN balance > 0 THEN balance END)   AS avgBalance,
      SUM(total_earned)                             AS totalEarned,
      SUM(total_spent)                              AS totalSpent,
      SUM(xp_total)                                 AS totalXp,
      SUM(woots)                                    AS totalWoots,
      SUM(dj_plays)                                 AS totalDjPlays,
      SUM(chat_count)                               AS totalChats,
      SUM(join_count)                               AS totalJoins,
      SUM(casino_wins)                              AS casinoWins,
      SUM(casino_losses)                            AS casinoLosses,
      SUM(steal_wins)                               AS stealWins,
      SUM(steal_losses)                             AS stealLosses,
      MAX(daily_streak)                             AS maxStreak,
      COUNT(CASE WHEN balance > 0 THEN 1 END)       AS usersWithBalance,
      COUNT(CASE WHEN last_seen_at > ? THEN 1 END)  AS activeUsers7d,
      COUNT(CASE WHEN last_seen_at > ? THEN 1 END)  AS activeUsers30d,
      COUNT(CASE WHEN last_seen_at <= ? AND last_seen_at > ? THEN 1 END) AS activeUsersPrev7d,
      COUNT(CASE WHEN last_seen_at <= ? AND last_seen_at > ? THEN 1 END) AS activeUsersPrev30d
    FROM users
  `,
    )
    .get(day7, day30, day7, day14, day30, day60);

  // ── User growth per day (last 60 days) ──────────────────────────────────
  const since60d = now - 60 * 24 * 60 * 60 * 1000;
  const growth = usersDb
    .prepare(
      `
    SELECT
      strftime('%Y-%m-%d', first_seen_at / 1000, 'unixepoch', 'localtime') AS day,
      COUNT(*) AS count
    FROM users
    WHERE first_seen_at > ?
    GROUP BY day
    ORDER BY day ASC
  `,
    )
    .all(since60d);

  // ── Top users ────────────────────────────────────────────────────────────
  const richest = usersDb
    .prepare(
      `SELECT display_name, username, balance FROM users ORDER BY balance DESC LIMIT 1`,
    )
    .get();
  const topLevel = usersDb
    .prepare(
      `SELECT display_name, username, level, xp_total FROM users ORDER BY level DESC, xp_total DESC LIMIT 1`,
    )
    .get();
  const topWooters = usersDb
    .prepare(
      `SELECT display_name, username, woots FROM users WHERE woots > 0 ORDER BY woots DESC LIMIT 5`,
    )
    .all();
  const topDJs = usersDb
    .prepare(
      `SELECT display_name, username, dj_plays FROM users WHERE dj_plays > 0 ORDER BY dj_plays DESC LIMIT 5`,
    )
    .all();
  const topChatters = usersDb
    .prepare(
      `SELECT display_name, username, chat_count FROM users WHERE chat_count > 0 ORDER BY chat_count DESC LIMIT 5`,
    )
    .all();
  const topCasinoWinners = usersDb
    .prepare(
      `SELECT display_name, username, casino_wins FROM users WHERE casino_wins > 0 ORDER BY casino_wins DESC LIMIT 5`,
    )
    .all();
  const topCasinoLosers = usersDb
    .prepare(
      `SELECT display_name, username, casino_losses FROM users WHERE casino_losses > 0 ORDER BY casino_losses DESC LIMIT 5`,
    )
    .all();
  const topRichest = usersDb
    .prepare(
      `SELECT display_name, username, balance FROM users WHERE balance > 0 ORDER BY balance DESC LIMIT 5`,
    )
    .all();

  // ── Economy / Bank ───────────────────────────────────────────────────────
  let bankTotal = 0;
  let bankUsers = 0;
  let topShopItems = [];
  try {
    const bankAgg = econDb
      .prepare(
        `SELECT SUM(balance) AS bankTotal, COUNT(*) AS bankUsers FROM bank_accounts WHERE balance > 0`,
      )
      .get();
    bankTotal = bankAgg?.bankTotal ?? 0;
    bankUsers = bankAgg?.bankUsers ?? 0;

    topShopItems = econDb
      .prepare(
        `SELECT item_key, SUM(quantity) AS total FROM shop_purchases GROUP BY item_key ORDER BY total DESC LIMIT 8`,
      )
      .all();
  } catch {
    /* table may not exist */
  }

  // ── Moderation ───────────────────────────────────────────────────────────
  let warningsTotal = 0;
  let warningsActive = 0;
  let trackBlacklistCount = 0;
  try {
    const warnAgg = blDb
      .prepare(
        `SELECT COUNT(*) AS total, COUNT(CASE WHEN cleared_at IS NULL THEN 1 END) AS active FROM warnings`,
      )
      .get();
    warningsTotal = warnAgg?.total ?? 0;
    warningsActive = warnAgg?.active ?? 0;
  } catch {
    /* ok */
  }
  try {
    const blAgg = blDb
      .prepare(`SELECT COUNT(*) AS count FROM track_blacklist`)
      .get();
    trackBlacklistCount = blAgg?.count ?? 0;
  } catch {
    /* ok */
  }

  // ── Music / Stats ────────────────────────────────────────────────────────
  let totalPlays = 0;
  let totalSongStats = 0;
  let topSongs = [];
  let playsHistory = [];
  try {
    const songAgg = statsDb
      .prepare(
        `SELECT COUNT(DISTINCT track_id) AS tracks, COUNT(*) AS totalPlays FROM track_history`,
      )
      .get();
    totalPlays = songAgg?.totalPlays ?? 0;

    const songCount = statsDb
      .prepare(`SELECT COUNT(*) AS cnt FROM song_stats`)
      .get();
    totalSongStats = songCount?.cnt ?? 0;

    topSongs = statsDb
      .prepare(
        `SELECT title, artist, plays, woots FROM song_stats ORDER BY plays DESC LIMIT 10`,
      )
      .all();

    const since30 = now - 30 * 24 * 60 * 60 * 1000;
    playsHistory = statsDb
      .prepare(
        `
      SELECT strftime('%Y-%m-%d', played_at / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS count
      FROM track_history WHERE played_at > ?
      GROUP BY day ORDER BY day ASC
    `,
      )
      .all(since30);
  } catch {
    /* ok */
  }

  return {
    // aggregates
    totalUsers: agg.totalUsers ?? 0,
    totalBalance: agg.totalBalance ?? 0,
    avgBalance: agg.avgBalance ?? 0,
    totalEarned: agg.totalEarned ?? 0,
    totalSpent: agg.totalSpent ?? 0,
    totalXp: agg.totalXp ?? 0,
    totalWoots: agg.totalWoots ?? 0,
    totalDjPlays: agg.totalDjPlays ?? 0,
    totalChats: agg.totalChats ?? 0,
    totalJoins: agg.totalJoins ?? 0,
    casinoWins: agg.casinoWins ?? 0,
    casinoLosses: agg.casinoLosses ?? 0,
    stealWins: agg.stealWins ?? 0,
    stealLosses: agg.stealLosses ?? 0,
    maxStreak: agg.maxStreak ?? 0,
    usersWithBalance: agg.usersWithBalance ?? 0,
    activeUsers7d: agg.activeUsers7d ?? 0,
    activeUsers30d: agg.activeUsers30d ?? 0,
    activeUsersPrev7d: agg.activeUsersPrev7d ?? 0,
    activeUsersPrev30d: agg.activeUsersPrev30d ?? 0,
    // economy
    bankTotal,
    bankUsers,
    topShopItems,
    // moderation
    warningsTotal,
    warningsActive,
    trackBlacklistCount,
    // music
    totalPlays,
    totalSongStats,
    topSongs,
    playsHistory,
    // lists
    growth,
    richest,
    topLevel,
    topWooters,
    topDJs,
    topChatters,
    topCasinoWinners,
    topCasinoLosers,
    topRichest,
  };
}
