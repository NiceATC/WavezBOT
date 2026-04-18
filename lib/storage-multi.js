// lib/storage-multi.js
// Multi-database storage system for better organization and performance

import BetterSqlite3 from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.resolve(process.cwd(), "data");

const DATABASES = {
  core: "core.sqlite",
  users: "users.sqlite",
  blacklist: "blacklist.sqlite",
  economy: "economy.sqlite",
  cache: "cache.sqlite",
  stats: "stats.sqlite",
};

// Map table names to their database
const TABLE_TO_DB = {
  // Core config
  settings: "core",

  // Unified user profiles
  users: "users",

  // Moderation/Blacklist
  blacklist: "blacklist",
  track_blacklist: "blacklist",
  warnings: "blacklist",

  // Economy (per-user items — kept separate because many rows per user)
  shop_purchases: "economy",
  user_rewards: "economy",
  bank_accounts: "economy",
  user_insurance: "economy",

  // Cache/Ephemeral (frequent writes, not critical)
  waitlist_state: "cache",
  greet_state: "cache",
  afk_state: "cache",

  // Stats/Analytics (not per-user single-row)
  track_history: "stats",
  song_stats: "stats",
};

const _dbs = new Map();
let _transactionWrite = Promise.resolve();

export function getDbCatalog() {
  return { ...DATABASES };
}

export function getTableToDbMap() {
  return { ...TABLE_TO_DB };
}

export function getDbForTable(tableName) {
  const dbKey = TABLE_TO_DB[tableName];
  if (!dbKey) {
    throw new Error(`Unknown table: ${tableName}`);
  }
  const dbInstance = _dbs.get(dbKey);
  if (!dbInstance) {
    throw new Error(`Database not initialized: ${dbKey}`);
  }
  return dbInstance;
}

function tableExists(dbInstance, name) {
  const row = dbInstance
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(String(name));
  return Boolean(row?.name);
}

export async function initStorageMulti() {
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Initialize all databases
  for (const [key, filename] of Object.entries(DATABASES)) {
    const dbPath = path.join(DATA_DIR, filename);
    const db = new BetterSqlite3(dbPath);
    _dbs.set(key, db);
  }

  // Create all tables
  await _initCoreTables();
  await _initUsersTables();
  await _initBlacklistTables();
  await _initEconomyTables();
  await _initCacheTables();
  await _initStatsTables();
}

async function _initCoreTables() {
  const db = _dbs.get("core");
  db.exec(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
}

async function _initUsersTables() {
  const db = _dbs.get("users");
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    user_id              TEXT    PRIMARY KEY,
    username             TEXT,
    display_name         TEXT,
    first_seen_at        INTEGER NOT NULL DEFAULT 0,
    last_seen_at         INTEGER NOT NULL DEFAULT 0,
    -- VIP (future)
    vip_level            INTEGER NOT NULL DEFAULT 0,
    vip_expires_at       INTEGER,
    vip_auto_renew       INTEGER NOT NULL DEFAULT 0,
    vip_renew_level_key  TEXT,
    vip_renew_duration_key TEXT,
    vip_greet_message    TEXT,
    -- XP / Leveling
    level                INTEGER NOT NULL DEFAULT 1,
    xp                   INTEGER NOT NULL DEFAULT 0,
    xp_total             INTEGER NOT NULL DEFAULT 0,
    -- Economy
    balance              INTEGER NOT NULL DEFAULT 0,
    total_earned         REAL    NOT NULL DEFAULT 0,
    total_spent          REAL    NOT NULL DEFAULT 0,
    -- Casino stats
    casino_last_claim_at INTEGER NOT NULL DEFAULT 0,
    casino_wins          INTEGER NOT NULL DEFAULT 0,
    casino_losses        INTEGER NOT NULL DEFAULT 0,
    -- Steal stats
    steal_last_claim_at  INTEGER NOT NULL DEFAULT 0,
    steal_wins           INTEGER NOT NULL DEFAULT 0,
    steal_losses         INTEGER NOT NULL DEFAULT 0,
    -- Stats
    woots                INTEGER NOT NULL DEFAULT 0,
    dj_plays             INTEGER NOT NULL DEFAULT 0,
    chat_count           INTEGER NOT NULL DEFAULT 0,
    join_count           INTEGER NOT NULL DEFAULT 0,
    -- Daily reward
    daily_last_claim_at  INTEGER NOT NULL DEFAULT 0,
    daily_streak         INTEGER NOT NULL DEFAULT 0,
    -- Work
    work_job_key         TEXT,
    work_last_claim_at   INTEGER NOT NULL DEFAULT 0,
    -- Timestamps
    updated_at           INTEGER NOT NULL DEFAULT 0
  )`);

  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_users_balance ON users(balance DESC)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_users_xp ON users(level DESC, xp DESC)",
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_users_woots ON users(woots DESC)");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_users_dj_plays ON users(dj_plays DESC)",
  );
}

async function _initBlacklistTables() {
  const db = _dbs.get("blacklist");

  db.exec(`CREATE TABLE IF NOT EXISTS blacklist (
    type TEXT,
    value TEXT,
    PRIMARY KEY (type, value)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS track_blacklist (
    track_id TEXT PRIMARY KEY,
    source TEXT,
    source_id TEXT,
    title TEXT,
    artist TEXT,
    added_at INTEGER
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    moderator_user_id TEXT,
    reason TEXT,
    source TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    cleared_at INTEGER
  )`);

  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_warnings_user_active ON warnings(user_id, created_at DESC)",
  );
}

async function _initEconomyTables() {
  const db = _dbs.get("economy");

  // shop_purchases and user_rewards stay separate (many rows per user)
  db.exec(`CREATE TABLE IF NOT EXISTS shop_purchases (
    user_id TEXT,
    item_key TEXT,
    quantity INTEGER,
    updated_at INTEGER,
    PRIMARY KEY (user_id, item_key)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS user_rewards (
    user_id TEXT,
    type TEXT,
    reward_key TEXT,
    level INTEGER,
    created_at INTEGER,
    PRIMARY KEY (user_id, type, reward_key)
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS bank_accounts (
    user_id TEXT PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0,
    last_online_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS user_insurance (
    user_id       TEXT PRIMARY KEY,
    remaining_days INTEGER NOT NULL DEFAULT 0,
    last_seen_date TEXT NOT NULL DEFAULT '',
    updated_at    INTEGER NOT NULL DEFAULT 0
  )`);
  // Migrate: add new columns to existing tables if they don't exist yet
  try {
    db.exec(
      "ALTER TABLE user_insurance ADD COLUMN remaining_days INTEGER NOT NULL DEFAULT 0",
    );
  } catch {}
  try {
    db.exec(
      "ALTER TABLE user_insurance ADD COLUMN last_seen_date TEXT NOT NULL DEFAULT ''",
    );
  } catch {}

  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_user_insurance_updated ON user_insurance(updated_at)",
  );
}

async function _initCacheTables() {
  const db = _dbs.get("cache");

  // Migration: rename old table if it exists
  const hasLegacyDcWaitlist = tableExists(db, "dc_waitlist_snapshot");
  const hasWaitlistState = tableExists(db, "waitlist_state");

  if (hasLegacyDcWaitlist && !hasWaitlistState) {
    db.exec("ALTER TABLE dc_waitlist_snapshot RENAME TO waitlist_state");
  }

  db.exec(`CREATE TABLE IF NOT EXISTS waitlist_state (
    room_slug TEXT,
    room_id TEXT,
    user_id TEXT PRIMARY KEY,
    public_id TEXT,
    username TEXT,
    display_name TEXT,
    position INTEGER,
    queue_length INTEGER,
    is_current_dj INTEGER,
    last_seen_at INTEGER,
    last_left_at INTEGER,
    source TEXT,
    updated_at INTEGER
  )`);

  if (hasLegacyDcWaitlist && hasWaitlistState) {
    db.exec(`INSERT INTO waitlist_state (
      room_slug, room_id, user_id, public_id, username, display_name,
      position, queue_length, is_current_dj, last_seen_at, last_left_at, source, updated_at
    )
    SELECT
      room_slug, room_id, user_id, public_id, username, display_name,
      position, queue_length, is_current_dj, last_seen_at, last_left_at, source, updated_at
    FROM dc_waitlist_snapshot
    ON CONFLICT(user_id) DO UPDATE SET
      room_slug = excluded.room_slug,
      room_id = excluded.room_id,
      public_id = COALESCE(excluded.public_id, waitlist_state.public_id),
      username = COALESCE(excluded.username, waitlist_state.username),
      display_name = COALESCE(excluded.display_name, waitlist_state.display_name),
      position = excluded.position,
      queue_length = excluded.queue_length,
      is_current_dj = excluded.is_current_dj,
      last_seen_at = excluded.last_seen_at,
      last_left_at = COALESCE(excluded.last_left_at, waitlist_state.last_left_at),
      source = excluded.source,
      updated_at = excluded.updated_at`);
    db.exec("DROP TABLE dc_waitlist_snapshot");
  }

  if (tableExists(db, "waitlist_snapshot")) {
    db.exec("DROP TABLE waitlist_snapshot");
  }

  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_waitlist_state_room ON waitlist_state(room_slug)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_waitlist_state_seen ON waitlist_state(last_seen_at)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_waitlist_state_name ON waitlist_state(username, display_name)",
  );

  db.exec(`CREATE TABLE IF NOT EXISTS greet_state (
    user_id TEXT PRIMARY KEY,
    greeted_at INTEGER,
    greeted_count INTEGER
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS afk_state (
    user_id TEXT PRIMARY KEY,
    last_chat_at INTEGER,
    last_join_at INTEGER,
    updated_at INTEGER
  )`);
}

async function _initStatsTables() {
  const db = _dbs.get("stats");

  db.exec(`CREATE TABLE IF NOT EXISTS track_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id TEXT,
    title TEXT,
    artist TEXT,
    dj_id TEXT,
    dj_name TEXT,
    played_at INTEGER
  )`);

  // user_woot_stats and user_dj_stats are now in users.sqlite
  db.exec(`CREATE TABLE IF NOT EXISTS song_stats (
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

// Compatibility wrapper for operations
export const db = {
  exec(sql) {
    throw new Error(
      "exec() is table-agnostic. Use getDbForTable() or call directly on db instance.",
    );
  },
  run(sql, ...args) {
    throw new Error(
      "run() is table-agnostic. Use getDbForTable() or call directly on db instance.",
    );
  },
  get(sql, ...args) {
    throw new Error(
      "get() is table-agnostic. Use getDbForTable() or call directly on db instance.",
    );
  },
  all(sql, ...args) {
    throw new Error(
      "all() is table-agnostic. Use getDbForTable() or call directly on db instance.",
    );
  },
};

// Get a prepared statement helper for a table
export function prepareForTable(tableName) {
  const dbInstance = getDbForTable(tableName);
  return {
    prepare: (sql) => dbInstance.prepare(sql),
    exec: (sql) => dbInstance.exec(sql),
  };
}

// Transaction helper
export async function runTransaction(work) {
  const run = async () => {
    // Note: Transactions work per-database, not across all DBs
    // If you need multi-DB transactions, coordinate at application level
    try {
      const result = await work();
      return result;
    } catch (err) {
      throw err;
    }
  };

  return new Promise((resolve, reject) => {
    _transactionWrite = _transactionWrite
      .then(() => run())
      .then((result) => {
        resolve(result);
      })
      .catch((err) => {
        reject(err);
      });
  });
}

export function closeAll() {
  for (const db of _dbs.values()) {
    try {
      db.close();
    } catch {
      // best-effort
    }
  }
  _dbs.clear();
}
