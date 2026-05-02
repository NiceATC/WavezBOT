/**
 * lib/bot.js
 *
 * Core WavezBot class.
 *
 * Responsibilities:
 *  - Connect to the Wavez platform via @wavezfm/api (REST + realtime)
 *  - Auto-woot new tracks (optional)
 *  - Dispatch chat commands to CommandRegistry
 *  - Dispatch realtime events to EventRegistry (greetings, custom hooks, etc.)
 *  - Reply when @mentioned with the configured bot message
 *
 * Authentication: login with BOT_EMAIL + BOT_PASSWORD, then auto-creates a
 * Room Bot Token via client.room.createBotToken() for realtime + roomBot APIs.
 *
 * Adding a command: drop a .js file in commands/
 * Adding an event handler: drop a .js file in events/
 * No changes needed here in either case.
 */

import {
  createApiClient,
  createRoomBotRealtimeClient,
  parseRoomQueueSnapshot,
} from "@wavezfm/api";
import { WebSocket } from "ws";
import { WavezEvents as Events } from "./wavez-events.js";
import { CommandRegistry } from "../commands/index.js";
import { EventRegistry } from "../events/index.js";
import { loadConfig } from "./config.js";
import { getRoleLevel, getPlatformRoleLevel } from "./permissions.js";
import {
  readStoredToken,
  isTokenValid,
  saveToken,
  clearStoredToken,
} from "./token-store.js";
import {
  getTrackBlacklist,
  getEconomyBalance,
  setEconomyBalance,
  getXpState,
  setXpState,
  getVipState as getVipStateStorage,
  setVipState as setVipStateStorage,
  setVipRenewalSettings,
  applyVipPurchase,
  addUserReward,
  addTrackHistory,
  incrementUserDjPlay,
  incrementUserWoot,
  incrementSongPlay,
  incrementSongWoot,
  incrementEconomyEarned,
  incrementEconomySpent,
  getLeaderboardResetAt,
  setLeaderboardResetAt,
  resetLeaderboards,
  listAfkState,
  markWaitlistUserLeft,
  upsertAfkStateBatch,
  upsertWaitlistSnapshot,
  getVipGreetMessage,
  setVipGreetMessage,
} from "./storage.js";
import { BOT_VERSION } from "./version.js";
import { createApiCalls } from "./api/index.js";
import {
  resetRouletteState,
  startAutoRoulette,
  stopAutoRoulette,
} from "../helpers/roulette.js";
import {
  startAutoLiveEvents,
  stopAutoLiveEvents,
} from "../helpers/live-events.js";
import { ensureMention } from "../helpers/chat.js";
import { POINT_SCALE, toPointsInt } from "../helpers/points.js";
import {
  normalizeLocale,
  resolveLocalizedValue,
  t as translate,
  tArray as translateArray,
} from "./i18n.js";
import {
  createApiTrafficLogger,
  attachApiClientTrafficLogger,
  attachRealtimeTrafficLogger,
} from "./debug.js";
import {
  getNextDjEntry,
  getWaitlistPositionForIndex,
  getWaitlistTotal,
} from "./waitlist.js";
import {
  buildVipPlans,
  findVipPlan,
  findVipPlanByKey,
  getVipBenefits,
  getVipDurationLabel,
  getVipLevelLabel,
  resolveVipState,
  vipRankFromLevel,
  vipLevelFromRank,
} from "./vip.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Delay after booth:advance before casting the auto-woot vote */
const WOOT_DELAY_MS = 800;

/** Extra grace after track end before auto-skip triggers */
const AUTO_SKIP_GRACE_MS = 10_000;

/** Throttle AFK persistence to reduce DB writes */
const AFK_PERSIST_THROTTLE_MS = 15_000;
const AFK_PERSIST_RETRY_MS = 5_000;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BASE_DELAY_MS = 30_000;
const RECONNECT_MAX_DELAY_MS = 60_000;
const RECONNECT_STABLE_RESET_MS = 20_000;

/** Throttle economy/xp persistence to reduce DB writes */
const ECONOMY_PERSIST_THROTTLE_MS = 10_000;
const ECONOMY_PERSIST_RETRY_MS = 10_000;

/** Online points accrue in full-hour blocks, checked on a timer */
const ECONOMY_ONLINE_TICK_MS = 5 * 60_000;

/** Periodic waitlist snapshot every 30 seconds for DC reliability */
const PERIODIC_WAITLIST_SNAPSHOT_MS = 30_000;

/** Throttle leaderboard reset checks */
const LEADERBOARD_RESET_CHECK_THROTTLE_MS = 60_000;
const VIP_STATE_CACHE_MS = 30_000;

function getSnapshotCurrentDjId(snapshot) {
  return (
    snapshot?.playback?.djId ??
    snapshot?.playback?.dj?.userId ??
    snapshot?.playback?.dj?.user_id ??
    snapshot?.playback?.dj?.id ??
    snapshot?.dj?.userId ??
    snapshot?.dj?.user_id ??
    snapshot?.dj?.id ??
    snapshot?.currentDj?.userId ??
    snapshot?.currentDj?.user_id ??
    snapshot?.currentDj?.id ??
    snapshot?.current_dj?.userId ??
    snapshot?.current_dj?.user_id ??
    snapshot?.current_dj?.id ??
    null
  );
}

const PAUSED_COMMAND_ALLOWLIST = new Set([
  "start",
  "resume",
  "unpause",
  "continuar",
  "iniciar",
  "stop",
  "pause",
  "parar",
  "pausar",
]);

// ── Bot ───────────────────────────────────────────────────────────────────────

export class WavezBot {
  /**
   * @param {ReturnType<import('./config.js').loadConfig>} [cfg]
   */
  constructor(cfg = loadConfig()) {
    this.cfg = cfg;
    this._locale = normalizeLocale(cfg.locale);

    /** @type {import('@wavezfm/api').WavezApiClient|null} */
    this._api = null;
    this._roomId = null;
    this._botToken = null;
    this._apiCalls = null;

    // ── Bot identity (filled after login) ────────────────────────────────────
    this._userId = null;
    this._username = null;
    this._displayName = null;

    // ── Session stats ────────────────────────────────────────────────────────
    this._startedAt = null;
    this._wootCount = 0;
    this._reactions = { woots: 0, mehs: 0, grabs: 0 };
    this._currentReactions = { woots: 0, mehs: 0, grabs: 0 };

    // ── Current track / DJ ───────────────────────────────────────────────────
    this._currentTrack = null;
    this._djId = null;
    this._djName = null;
    this._currentTrackStartedAt = null;
    this._songCount = 0;
    /** trackId of the last playback seen — used to detect advances from room_state_snapshot */
    this._lastKnownTrackId = null;

    // ── Waitlist (passive tracking — bot does NOT auto-join) ─────────────────
    this._waitlistPosition = null;
    this._waitlistTotal = null;
    this._nextDjName = null;

    // ── Room info & user cache ───────────────────────────────────────────────
    this._roomName = null;
    /** @type {Record<string,string>} uid → displayName (fast lookup for waitlist names) */
    this._roomUsersMap = {};
    /**
     * Full per-user data, updated via pipeline events.
     * @type {Map<string, {userId:string, username:string, displayName:string, role:string, platformRole:string|null, platformRoles:string[]}>}
     */
    this._roomUsers = new Map();
    /** The bot's own role in the current room */
    this._botRole = null;

    // ── Mention reply cooldown ───────────────────────────────────────────────
    this._mentionLastReply = 0;

    // ── Skip mutex (avoid multi-skip races) ─────────────────────────────────
    this._skipMutex = { inFlight: false, lastKey: null, lastAt: 0 };

    // ── Vote skip state ───────────────────────────────────────────────
    this._voteSkipState = null;

    // ── Activity tracking (AFK / last seen) ───────────────────────────────
    this._lastChatAt = new Map();
    this._userJoinAt = new Map();
    this._afkPersistQueue = new Map();
    this._afkPersistLast = new Map();
    this._afkPersistTimer = null;
    this._afkPersistTimerAt = 0;

    // ── Economy / XP tracking ───────────────────────────────────────────
    this._economyBalances = new Map();
    this._economyIdentity = new Map();
    this._xpStates = new Map();
    this._economyPersistQueue = new Set();
    this._xpPersistQueue = new Set();
    this._economyPersistTimer = null;
    this._economyPersistTimerAt = 0;
    this._economyPersistInFlight = false;
    this._economyChatLast = new Map();
    this._economyVoteTrack = new Map();
    this._economyGrabTrack = new Map();
    this._economyOnlineLast = new Map();
    this._economyOnlineTimer = null;
    this._progressLock = Promise.resolve();
    this._vipStates = new Map();
    this._vipStateFetchedAt = new Map();
    this._vipJoinPromptedAt = new Map();
    this._vipGreetMessages = new Map();

    // ── Leaderboard tracking ─────────────────────────────────────────────
    this._leaderboardVoteTrack = new Map();
    this._leaderboardResetInFlight = false;
    this._leaderboardResetLastCheck = 0;

    // ── Periodic waitlist snapshot ───────────────────────────────────────────
    this._periodicWaitlistSnapshotTimer = null;

    // ── Auto-skip timer ───────────────────────────────────────────────────
    this._autoSkipTimer = null;
    this._autoSkipTrackKey = null;

    // ── Pipeline client ──────────────────────────────────────────────────────
    this._pipeline = null;
    this._pingIntervalId = null;
    this._paused = false;
    this._intentionalStop = false;
    this._isReconnecting = false;
    this._reconnectAttempts = 0;
    this._reconnectTimer = null;
    this._reconnectInFlight = false;
    this._reconnectResetTimer = null;

    // ── Registries ───────────────────────────────────────────────────────────
    this.commands = new CommandRegistry();
    this.events = new EventRegistry();
    this._modulesLoaded = false;

    // ── Dashboard log hook ──────────────────────────────────────────────────
    this._logSink = null;

    // ── API traffic logger ──────────────────────────────────────────────────
    this._apiTrafficLogger = createApiTrafficLogger({
      enabled: this.cfg.debug,
      logDir: this.cfg.debugLogDir,
      maxFileMB: this.cfg.maxDebugFileMB,
      maxEntryKB: this.cfg.maxDebugEntryKB,
    });

    if (this._apiTrafficLogger?.enabled) {
      this._log(
        "info",
        `API debug logging enabled (by category): ${this._apiTrafficLogger.logDir}`,
      );
    }

    // ── Chat message cache (for nuke / delmsg / duel fallback) ───────────────
    /** @type {Map<string, string[]>} userId → recent messageIds (capped) */
    this._chatMessages = new Map();
    /** @type {Map<string, number>} userId → auto-delete expiresAt (simulated mute) */
    this._autoDeleteUsers = new Map();
    /** @type {Set<string>} userIds currently under a duel mute */
    this._duelMutedUsers = new Set();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** UUID da sala (disponível após login) */
  get roomId() {
    return this._roomId;
  }

  async loadModules() {
    if (this._modulesLoaded) return;

    const cmdSummary = await this.commands.loadDir(
      new URL("../commands/", import.meta.url),
    );
    const evtSummary = await this.events.loadDir(
      new URL("../events/", import.meta.url),
    );

    if (!this.cfg.greetEnabled) this.events.disable("greet");

    for (const [name, enabled] of Object.entries(
      this.cfg.commandToggles ?? {},
    )) {
      if (enabled) this.commands.enable(name);
      else this.commands.disable(name);
    }

    for (const [name, enabled] of Object.entries(this.cfg.eventToggles ?? {})) {
      if (enabled) this.events.enable(name);
      else this.events.disable(name);
    }

    this._modulesLoaded = true;

    const cmdFailed = cmdSummary?.failed ?? 0;
    const cmdLoaded = cmdSummary?.loaded ?? 0;
    const evtFailed = evtSummary?.failed ?? 0;
    const evtLoaded = evtSummary?.loaded ?? 0;

    this._log(
      "info",
      this.t("logs.modules.commandsLoaded", {
        loaded: cmdLoaded,
        failed: cmdFailed,
      }),
    );
    if (cmdFailed && cmdSummary?.errors?.length) {
      this._log(
        "warn",
        this.t("logs.modules.commandFailures", {
          files: cmdSummary.errors.map((e) => e.file).join(", "),
        }),
      );
    }

    this._log(
      "info",
      this.t("logs.modules.eventsLoaded", {
        loaded: evtLoaded,
        failed: evtFailed,
      }),
    );
    if (evtFailed && evtSummary?.errors?.length) {
      this._log(
        "warn",
        this.t("logs.modules.eventFailures", {
          files: evtSummary.errors.map((e) => e.file).join(", "),
        }),
      );
    }
  }

  async loadAfkState() {
    let rows = [];
    try {
      rows = await listAfkState();
    } catch {
      return 0;
    }

    for (const row of rows ?? []) {
      const uid = String(row?.user_id ?? row?.userId ?? "");
      if (!uid) continue;
      const lastChatAt = Number(row?.last_chat_at ?? row?.lastChatAt ?? 0);
      const lastJoinAt = Number(row?.last_join_at ?? row?.lastJoinAt ?? 0);
      const updatedAt = Number(row?.updated_at ?? row?.updatedAt ?? 0);
      if (Number.isFinite(lastChatAt) && lastChatAt > 0) {
        this._lastChatAt.set(uid, lastChatAt);
      }
      if (Number.isFinite(lastJoinAt) && lastJoinAt > 0) {
        this._userJoinAt.set(uid, lastJoinAt);
      }
      if (Number.isFinite(updatedAt) && updatedAt > 0) {
        this._afkPersistLast.set(uid, updatedAt);
      }
    }

    return rows.length;
  }

  async connect() {
    if (this._pipeline) {
      await this.stop();
    }
    this._intentionalStop = false;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._reconnectResetTimer) {
      clearTimeout(this._reconnectResetTimer);
      this._reconnectResetTimer = null;
    }
    this._isReconnecting = false;
    this._reconnectAttempts = 0;
    this._reconnectInFlight = false;
    await this._login();
    this._startPipeline();
  }

  async start() {
    await this.loadModules();
    await this.connect();
  }

  async reload() {
    await this.stop();
    await this.connect();
  }

  async reloadCommands() {
    this.commands.reset();
    const summary = await this.commands.loadDir(
      new URL("../commands/", import.meta.url),
    );
    const failed = summary?.failed ?? 0;
    const loaded = summary?.loaded ?? 0;
    this._log(
      "info",
      this.t("logs.modules.commandsLoaded", {
        loaded,
        failed,
      }),
    );
    if (failed && summary?.errors?.length) {
      this._log(
        "warn",
        this.t("logs.modules.commandFailures", {
          files: summary.errors.map((e) => e.file).join(", "),
        }),
      );
    }
    return summary;
  }

  async reloadEvents() {
    this.events.reset();
    const summary = await this.events.loadDir(
      new URL("../events/", import.meta.url),
    );
    if (!this.cfg.greetEnabled) this.events.disable("greet");
    const failed = summary?.failed ?? 0;
    const loaded = summary?.loaded ?? 0;
    this._log(
      "info",
      this.t("logs.modules.eventsLoaded", {
        loaded,
        failed,
      }),
    );
    if (failed && summary?.errors?.length) {
      this._log(
        "warn",
        this.t("logs.modules.eventFailures", {
          files: summary.errors.map((e) => e.file).join(", "),
        }),
      );
    }
    return summary;
  }

  pause() {
    if (this._paused) return false;
    this._paused = true;
    this._log("info", this.t("logs.bot.paused"));
    return true;
  }

  resume() {
    if (!this._paused) return false;
    this._paused = false;
    this._log("info", this.t("logs.bot.resumed"));
    return true;
  }

  isPaused() {
    return this._paused;
  }

  async stop() {
    stopAutoLiveEvents();
    stopAutoRoulette();
    resetRouletteState();
    if (this._voteSkipState?.timeoutId) {
      clearTimeout(this._voteSkipState.timeoutId);
    }
    this._voteSkipState = null;
    this._clearAutoSkipTimer();
    if (this._pingIntervalId) {
      clearInterval(this._pingIntervalId);
      this._pingIntervalId = null;
    }
    await this._flushAfkPersist(true);
    await this._flushEconomyPersist(true);
    this._stopEconomyOnlineTimer();
    this._stopPeriodicWaitlistSnapshot();
    this._economyOnlineLast.clear();
    this._intentionalStop = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._reconnectResetTimer) {
      clearTimeout(this._reconnectResetTimer);
      this._reconnectResetTimer = null;
    }
    this._isReconnecting = false;
    this._reconnectAttempts = 0;
    this._reconnectInFlight = false;
    if (this._pipeline) {
      try {
        this._pipeline.leaveRoom(this._roomId);
      } catch {
        // best-effort
      }
      this._pipeline.disconnect();
      this._pipeline = null;
    }
    this._log("info", this.t("logs.bot.stopped"));
  }

  _queueReconnect() {
    if (this._intentionalStop) return;
    if (this._reconnectTimer || this._reconnectInFlight) return;

    if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this._isReconnecting = false;
      this._log(
        "error",
        `Reconnect limit reached (${MAX_RECONNECT_ATTEMPTS}). Stopping auto reconnect.`,
      );
      return;
    }

    this._isReconnecting = true;
    this._reconnectAttempts += 1;
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, this._reconnectAttempts - 1),
      RECONNECT_MAX_DELAY_MS,
    );

    this._log(
      "info",
      this.t("logs.bot.reconnecting", {
        attempt: this._reconnectAttempts,
        delay: Math.round(delay / 1000),
      }),
    );

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      void this._performReconnectAttempt();
    }, delay);
  }

  async _performReconnectAttempt() {
    if (this._intentionalStop || this._reconnectInFlight) return;
    this._reconnectInFlight = true;

    try {
      await this._login();
      if (this._intentionalStop) return;
      this._startPipeline();
    } catch (err) {
      this._log(
        "warn",
        this.t("logs.bot.reconnectFailed", { error: err.message }),
      );
      this._reconnectInFlight = false;
      this._queueReconnect();
      return;
    }

    this._reconnectInFlight = false;
  }

  // ── Login (REST) ───────────────────────────────────────────────────────────

  async _login() {
    // Derive the site origin from the apiUrl so the Origin header matches
    // the host that the Wavez backend expects (required for session auth).
    const apiOrigin = (() => {
      try {
        const u = new URL(this.cfg.apiUrl);
        return `${u.protocol}//${u.host}`;
      } catch {
        return this.cfg.apiUrl;
      }
    })();

    this._api = createApiClient({
      baseURL: this.cfg.apiUrl,
      timeout: 20_000,
      logging: false,
      headers: {
        Origin: apiOrigin,
        Referer: `${apiOrigin}/`,
      },
    });

    if (this._apiTrafficLogger?.enabled && this.cfg.debugRest !== false) {
      attachApiClientTrafficLogger(this._api, this._apiTrafficLogger, () => ({
        roomSlug: this.cfg.room,
        roomId: this._roomId,
        userId: this._userId,
      }));
    }

    this._apiCalls = createApiCalls(this._api);

    try {
      if (this.cfg.botToken) {
        // ── Mode A: pre-generated bot token (BOT_TOKEN in .env) ──────────────
        // The token was generated by the room owner via POST /api/rooms/:id/bot-tokens.
        // No login flow needed — authenticate the SDK client directly.
        this._botToken = this.cfg.botToken;
        this._api.api.setRoomBotToken(this._botToken);
        this._api.api.defaultHeaders.set(
          "Authorization",
          `Bearer ${this._botToken}`,
        );

        this._log("info", this.t("logs.bot.usingBotToken"));

        // Resolve room UUID from slug (public endpoint — no auth needed).
        const roomRes = await this._api.room.getBySlug(this.cfg.room);
        const roomData =
          roomRes?.data?.data?.room ??
          roomRes?.data?.room ??
          roomRes?.data ??
          {};

        if (roomData.slug && roomData.slug !== this.cfg.room) {
          throw new Error(
            `Room slug "${this.cfg.room}" not found on this server ` +
              `(got "${roomData.slug}" instead). ` +
              `Check the "room" field in config.json.`,
          );
        }
        this._roomId = roomData.id;
        this._roomName = roomData.name ?? null;

        if (!this._roomId) {
          throw new Error(
            this.t("logs.bot.roomNotFound", { room: this.cfg.room }),
          );
        }

        // Identity will be populated from the WebSocket ACK (connected packet).
        // Avoids an HTTP bot call that may fail before the WS is established.
      } else {
        // ── Mode B: email + password login, then create a bot token ──────────
        // Before hitting the login endpoint, check if we have a valid saved token.
        const stored = readStoredToken();
        if (stored && isTokenValid(stored)) {
          this._botToken = stored.token;
          this._api.api.setRoomBotToken(this._botToken);
          this._api.api.defaultHeaders.set(
            "Authorization",
            `Bearer ${this._botToken}`,
          );

          this._log(
            "info",
            this.t("logs.bot.usingStoredToken", {
              expiresAt: stored.expiresAt ?? "?",
            }),
          );

          // Resolve room UUID from slug (public endpoint).
          const roomRes = await this._api.room.getBySlug(this.cfg.room);
          const roomData =
            roomRes?.data?.data?.room ??
            roomRes?.data?.room ??
            roomRes?.data ??
            {};

          if (roomData.slug && roomData.slug !== this.cfg.room) {
            throw new Error(
              `Room slug "${this.cfg.room}" not found on this server ` +
                `(got "${roomData.slug}" instead). ` +
                `Check the "room" field in config.json.`,
            );
          }
          this._roomId = roomData.id;
          this._roomName = roomData.name ?? null;

          if (!this._roomId) {
            throw new Error(
              this.t("logs.bot.roomNotFound", { room: this.cfg.room }),
            );
          }

          this._userId = stored.botUserId ?? null;
          this._username = stored.botName ?? null;
          this._displayName = stored.botName ?? null;
          this._botRole = stored.actorRole ?? null;
        } else {
          // No valid stored token — run the full login flow.
          await this._loginWithPassword();
        }
      }

      if (this._userId) {
        this._log(
          "info",
          this.t("logs.bot.loggedIn", {
            username: this._username,
            userId: this._userId,
          }),
        );
      }
    } catch (err) {
      const status = err.status ?? err.response?.status;
      throw new Error(
        this.t("logs.bot.loginFailed", {
          status: status ?? this.t("common.network"),
          error: err.message,
        }),
      );
    }
  }

  // ── Full login flow (email + password → new bot token) ───────────────────

  async _loginWithPassword() {
    this._log("info", this.t("logs.bot.loggingIn", { email: this.cfg.email }));

    // 1. Login with email + password (session auth).
    const loginRes = await this._api.auth.login({
      email: this.cfg.email,
      password: this.cfg.password,
    });

    // 2. Forward session cookies to all subsequent requests.
    //    Node.js native fetch has no cookie jar — Set-Cookie headers from
    //    the login response are discarded. We extract and inject them manually.
    const rawHeaders = loginRes?.headers;
    if (rawHeaders) {
      const cookies = [];
      if (typeof rawHeaders.getSetCookie === "function") {
        for (const c of rawHeaders.getSetCookie()) {
          const pair = c.split(";")[0].trim();
          if (pair) cookies.push(pair);
        }
      } else {
        const raw = rawHeaders.get?.("set-cookie");
        if (raw) {
          for (const c of raw.split(",")) {
            const pair = c.trim().split(";")[0].trim();
            if (pair) cookies.push(pair);
          }
        }
      }
      if (cookies.length > 0) {
        this._api.api.defaultHeaders.set("Cookie", cookies.join("; "));
      }
    }

    // 3. Resolve room UUID from slug.
    const roomRes = await this._api.room.getBySlug(this.cfg.room);
    const roomData =
      roomRes?.data?.data?.room ?? roomRes?.data?.room ?? roomRes?.data ?? {};

    if (roomData.slug && roomData.slug !== this.cfg.room) {
      throw new Error(
        `Room slug "${this.cfg.room}" not found on this server ` +
          `(got "${roomData.slug}" instead). ` +
          `Check the "room" field in config.json.`,
      );
    }
    this._roomId = roomData.id;
    this._roomName = roomData.name ?? null;

    if (!this._roomId) {
      throw new Error(this.t("logs.bot.roomNotFound", { room: this.cfg.room }));
    }

    // 4. Create a Room Bot Token for this session.
    //    Includes manage_room so moderation commands work.
    const tokenRes = await this._api.room.createBotToken(this._roomId, {
      botName: "WavezBot",
      commandPrefix: this.cfg.cmdPrefix,
      permissions: ["read_state", "read_chat", "send_chat", "manage_room"],
      expiresInHours: 168, // 7 days
    });
    const tokenData = tokenRes?.data ?? {};
    this._botToken = tokenData.token;

    // 5. Authorize roomBot REST calls with the new token.
    //    setRoomBotToken sets X-Wavez-Bot-Token; also set Authorization: Bearer
    //    for servers that expect that header instead.
    this._api.api.setRoomBotToken(this._botToken);
    this._api.api.defaultHeaders.set(
      "Authorization",
      `Bearer ${this._botToken}`,
    );

    // 6. Persist for future restarts.
    try {
      saveToken(tokenData);
      this._log(
        "info",
        this.t("logs.bot.tokenSaved", {
          expiresAt: tokenData.expiresAt ?? "?",
        }),
      );
    } catch (saveErr) {
      this._log(
        "warn",
        this.t("logs.bot.tokenSaveFailed", { error: saveErr.message }),
      );
    }

    // 7. Bot identity.
    this._userId = tokenData.botUserId ?? null;
    this._username = tokenData.botName ?? null;
    this._displayName = tokenData.botName ?? null;
    this._botRole = tokenData.actorRole ?? null;
  }

  // ── Realtime client (WebSocket) ────────────────────────────────────────────

  _startPipeline() {
    this._pipeline = createRoomBotRealtimeClient({
      baseURL: this.cfg.apiUrl,
      botToken: this._botToken,
      roomId: this._roomId,
      autoJoinRoom: true,
      // Disable the SDK's built-in reconnect so that only the bot-level
      // _queueReconnect() logic runs.  Having both active causes a race:
      // the SDK reconnects in ~1.5s, but the bot's 30-second timer still
      // fires and creates a second duplicate connection.
      autoReconnect: false,
      logging: false,
      websocketFactory: (url, protocols) => new WebSocket(url, protocols),
    });

    if (this._apiTrafficLogger?.enabled && this.cfg.debugWs !== false) {
      attachRealtimeTrafficLogger(
        this._pipeline,
        this._apiTrafficLogger,
        () => ({
          roomSlug: this.cfg.room,
          roomId: this._roomId,
          userId: this._userId,
        }),
      );
    }

    // ── Connection lifecycle ────────────────────────────────────────────────

    this._pipeline.on(Events.WS_OPEN, () => {
      this._log(
        "info",
        this.t("logs.bot.wsReady", {
          room: this.cfg.room,
        }),
      );
    });

    // "connected" is the ACK sent by the server after the WS handshake.
    // autoJoinRoom=true automatically sends join_room after this point.
    this._pipeline.on(Events.WS_CONNECTED, (packet) => {
      // The ACK payload carries bot identity — use it to fill in any blanks,
      // especially when Mode A is used (BOT_TOKEN) and _login() skips getState.
      const ackPayload = packet?.payload ?? {};
      if (ackPayload.userId && !this._userId) {
        this._userId = String(ackPayload.userId);
      }
      if (ackPayload.username && !this._username) {
        this._username = String(ackPayload.username);
        this._displayName = String(ackPayload.username);
      }

      this._startedAt = Date.now();
      this._isReconnecting = false;
      this._reconnectInFlight = false;
      if (this._reconnectResetTimer) {
        clearTimeout(this._reconnectResetTimer);
      }
      // Only reset retry counter after a stable connection window.
      // This avoids loops that keep showing "attempt 1" when the socket drops
      // immediately after connecting (e.g., code 4409 session replaced).
      this._reconnectResetTimer = setTimeout(() => {
        this._reconnectResetTimer = null;
        this._reconnectAttempts = 0;
      }, RECONNECT_STABLE_RESET_MS);
      this._wootCount = 0;
      this._reactions = { woots: 0, mehs: 0, grabs: 0 };
      this._currentReactions = { woots: 0, mehs: 0, grabs: 0 };
      this._currentTrackStartedAt = null;
      this._songCount = 0;

      // Give the server a moment to process join_room, then bootstrap state.
      setTimeout(() => {
        this._joinRoom().catch((err) =>
          this._log(
            "warn",
            this.t("logs.bot.joinFailed", { error: err.message }),
          ),
        );
      }, 300);
    });

    this._pipeline.on(Events.WS_CLOSE, (packet) => {
      const payload = packet?.payload ?? {};
      const code = payload?.event?.code ?? "";
      const reason = payload?.event?.reason ? ` - ${payload.event.reason}` : "";
      this._log("info", this.t("logs.bot.disconnected", { code, reason }));

      if (this._intentionalStop) return;

      if (this._reconnectResetTimer) {
        clearTimeout(this._reconnectResetTimer);
        this._reconnectResetTimer = null;
      }

      this._pipeline = null;

      if (String(code) === "4409") {
        this._isReconnecting = false;
        this._reconnectInFlight = false;
        this._reconnectAttempts = 0;
        if (this._reconnectTimer) {
          clearTimeout(this._reconnectTimer);
          this._reconnectTimer = null;
        }
        this._log(
          "warn",
          "Sessao da sala substituida (4409). Reconexao automatica desativada.",
        );
        return;
      }

      this._queueReconnect();
    });

    this._pipeline.on(Events.WS_ERROR, (packet) => {
      this._log(
        "warn",
        this.t("logs.bot.wsError", {
          error: JSON.stringify(packet?.payload ?? {}),
        }),
      );
    });

    // Server-side error packets (type:"error" envelope from the WS server).
    // If the token is rejected, clear the stored token so the next reconnect
    // goes through the full login flow and generates a fresh one.
    this._pipeline.on(Events.WS_PACKET_ERROR, (packet) => {
      const code = packet?.event ?? packet?.payload?.code ?? "";
      const INVALID_TOKEN_CODES = new Set([
        "ROOM_BOT_TOKEN_REQUIRED",
        "ROOM_BOT_INVALID",
        "ROOM_BOT_SCOPE_MISMATCH",
        "ROOM_BOT_ROOM_MISMATCH",
      ]);
      if (INVALID_TOKEN_CODES.has(code)) {
        this._log("warn", this.t("logs.bot.tokenInvalid", { code }));
        clearStoredToken();
      } else {
        this._log(
          "warn",
          this.t("logs.bot.wsError", {
            error: JSON.stringify(packet?.payload ?? {}),
          }),
        );
      }
    });

    // ── Room event bindings ─────────────────────────────────────────────────

    this._pipeline.on(Events.ROOM_DJ_ADVANCE, (packet) =>
      this._onDjAdvance(packet.payload),
    );
    this._pipeline.on(Events.ROOM_WAITLIST_LEAVE, (packet) =>
      this._onWaitlistLeave(packet.payload),
    );
    this._pipeline.on(Events.ROOM_WAITLIST_UPDATE, (packet) =>
      this._onWaitlistUpdate(packet.payload),
    );
    this._pipeline.on(Events.ROOM_VOTE, (packet) =>
      this._onVote(packet.payload),
    );
    this._pipeline.on(Events.ROOM_GRAB, (packet) =>
      this._onGrab(packet.payload),
    );
    this._pipeline.on(Events.ROOM_CHAT_MESSAGE, (packet) =>
      this._onChatMessage(packet.payload),
    );
    this._pipeline.on(Events.ROOM_USER_JOIN, (packet) =>
      this._onRoomUserJoin(packet.payload),
    );
    this._pipeline.on(Events.ROOM_USER_LEAVE, (packet) =>
      this._onRoomUserLeave(packet.payload),
    );
    this._pipeline.on(Events.ROOM_USER_KICK, (packet) =>
      this._onRoomUserLeave(packet.payload),
    );
    this._pipeline.on(Events.ROOM_USER_BAN, (packet) =>
      this._onRoomUserLeave(packet.payload),
    );
    this._pipeline.on(Events.ROOM_USER_ROLE_UPDATE, (packet) =>
      this._onRoomUserRoleUpdate(packet.payload),
    );
    this._pipeline.on(Events.ROOM_USER_UPDATE, (packet) =>
      this._onRoomUserUpdate(packet.payload),
    );
    this._pipeline.on(Events.ROOM_TRACK_SKIPPED, (packet) =>
      this.events
        .dispatch(
          Events.ROOM_TRACK_SKIPPED,
          this._buildEventCtx(),
          packet.payload,
        )
        .catch(() => {}),
    );
    this._pipeline.on(Events.ROOM_TRACK_PAUSED, (packet) =>
      this.events
        .dispatch(
          Events.ROOM_TRACK_PAUSED,
          this._buildEventCtx(),
          packet.payload,
        )
        .catch(() => {}),
    );
    this._pipeline.on(Events.ROOM_TRACK_RESUMED, (packet) =>
      this.events
        .dispatch(
          Events.ROOM_TRACK_RESUMED,
          this._buildEventCtx(),
          packet.payload,
        )
        .catch(() => {}),
    );
    this._pipeline.on(Events.ROOM_CHAT_MESSAGE_DELETED, (packet) =>
      this.events
        .dispatch(
          Events.ROOM_CHAT_MESSAGE_DELETED,
          this._buildEventCtx(),
          packet.payload,
        )
        .catch(() => {}),
    );
    this._pipeline.on(Events.ROOM_CHAT_MESSAGE_UPDATED, (packet) =>
      this.events
        .dispatch(
          Events.ROOM_CHAT_MESSAGE_UPDATED,
          this._buildEventCtx(),
          packet.payload,
        )
        .catch(() => {}),
    );
    this._pipeline.on(Events.ROOM_CHAT_CLEARED, (packet) =>
      this.events
        .dispatch(
          Events.ROOM_CHAT_CLEARED,
          this._buildEventCtx(),
          packet.payload,
        )
        .catch(() => {}),
    );
    this._pipeline.on(Events.ROOM_QUEUE_REORDERED, (packet) =>
      this._onWaitlistUpdate(packet.payload),
    );
    this._pipeline.on(Events.ROOM_QUEUE_REORDERED, (packet) =>
      this.events
        .dispatch(
          Events.ROOM_QUEUE_REORDERED,
          this._buildEventCtx(),
          packet.payload,
        )
        .catch(() => {}),
    );
    this._pipeline.on(Events.ROOM_WAITLIST_JOIN, (packet) =>
      this.events
        .dispatch(
          Events.ROOM_WAITLIST_JOIN,
          this._buildEventCtx(),
          packet.payload,
        )
        .catch(() => {}),
    );

    // ── Room state snapshot ────────────────────────────────────────────────
    // The Wavez WS server sends room_state_snapshot on join and on every room
    // state change: user join/leave, track advance, vote, etc.
    // There is no dedicated track_started event — we detect advances here.
    this._pipeline.on(Events.ROOM_STATE_SNAPSHOT, (packet) => {
      // The full room state IS the payload (no extra .snapshot wrapper over WS)
      const snap = packet.payload ?? {};

      // ── Detect track advance ─────────────────────────────────────────────
      const pb = snap.playback ?? null;
      const newTrackId = pb?.trackId ?? null;
      if (newTrackId && newTrackId !== this._lastKnownTrackId) {
        this._lastKnownTrackId = newTrackId;
        // Build a normalized payload compatible with _onDjAdvance so both
        // the track_started path and this path use identical handling.
        const advancePayload = {
          media: {
            title: pb.title ?? null,
            artist: pb.artist ?? null,
            source: pb.source ?? null,
            sourceId: pb.sourceId ?? null,
            duration: pb.durationMs ?? null,
            durationMs: pb.durationMs ?? null,
          },
          dj: {
            id: pb.djId ?? null,
            username: pb.djUsername ?? null,
          },
          // Keep the raw flat fields too for any downstream consumers
          ...pb,
        };
        this._onDjAdvance(advancePayload);
      }

      // ── Sync vote counters from snapshot ─────────────────────────────────
      const votes = snap.votes ?? null;
      if (votes && pb?.trackId === this._lastKnownTrackId) {
        if (votes.woots != null) this._currentReactions.woots = votes.woots;
        if (votes.mehs != null) this._currentReactions.mehs = votes.mehs;
        if (votes.grabs != null) this._currentReactions.grabs = votes.grabs;
      }

      // ── Dispatch to event handlers (e.g. waitlistSnapshot) ───────────────
      this.events
        .dispatch(Events.ROOM_STATE_SNAPSHOT, this._buildEventCtx(), snap)
        .catch(() => {});
    });

    // ── WS heartbeat (ping every 30s to keep connection alive) ──────────────
    this._pipeline.on(Events.WS_CONNECTED, () => {
      if (this._pingIntervalId) clearInterval(this._pingIntervalId);
      this._pingIntervalId = setInterval(() => {
        if (this._pipeline) this._pipeline.ping();
      }, 30_000);
    });
    this._pipeline.on(Events.WS_CLOSE, () => {
      if (this._pingIntervalId) {
        clearInterval(this._pingIntervalId);
        this._pingIntervalId = null;
      }
    });

    this._pipeline.connect().catch((err) => {
      this._log("warn", this.t("logs.bot.wsError", { error: err.message }));
    });
  }

  // ── Room bootstrap ─────────────────────────────────────────────────────────

  /**
   * Seed _currentTrack / _djId / _djName from a room snapshot object.
   * Called from both room_state_snapshot WS event and _joinRoom HTTP state.
   * Only fills in values that aren't already set (first caller wins).
   */
  _seedTrackFromSnapshot(snap) {
    if (!snap || typeof snap !== "object") return;

    // Try common field names used by Wavez for current playback.
    const playback =
      snap.playback ??
      snap.currentPlayback ??
      snap.current_playback ??
      snap.booth ??
      snap.current ??
      null;

    const rawMedia =
      playback?.media ??
      playback?.track ??
      playback?.song ??
      snap.media ??
      snap.track ??
      snap.currentMedia ??
      null;

    const rawDj =
      playback?.dj ??
      playback?.user ??
      snap.dj ??
      snap.currentDj ??
      snap.current_dj ??
      null;

    if (rawMedia && !this._currentTrack?.title) {
      this._currentTrack = {
        title: rawMedia.title ?? null,
        artist:
          rawMedia.artist ??
          rawMedia.artistName ??
          rawMedia.artist_name ??
          null,
        duration: rawMedia.duration ?? rawMedia.length ?? null,
        source: rawMedia.source ?? rawMedia.platform ?? null,
        sourceId:
          rawMedia.sourceId ??
          rawMedia.source_id ??
          rawMedia.cid ??
          rawMedia.videoId ??
          rawMedia.video_id ??
          null,
        youtubeId:
          rawMedia.sourceId ??
          rawMedia.source_id ??
          rawMedia.youtubeId ??
          rawMedia.youtube_id ??
          rawMedia.cid ??
          rawMedia.videoId ??
          rawMedia.video_id ??
          null,
        link:
          rawMedia.link ??
          rawMedia.url ??
          rawMedia.sourceUrl ??
          rawMedia.source_url ??
          null,
      };
      if (!this._currentTrackStartedAt) {
        this._currentTrackStartedAt =
          playback?.startedAt ??
          playback?.started_at ??
          snap.startedAt ??
          Date.now();
      }
    }

    if (rawDj && this._djId == null) {
      this._djId = rawDj.userId ?? rawDj.user_id ?? rawDj.id ?? null;
      this._djName =
        rawDj.displayUsername ??
        rawDj.displayName ??
        rawDj.display_name ??
        rawDj.username ??
        null;
    }
  }

  async _joinRoom() {
    // The realtime client already sent join_room via autoJoinRoom=true.
    // We use roomBot.getState to seed the local room snapshot.
    let snapshot = {};
    try {
      const stateRes = await this._api.roomBot.getState(this._roomId);
      snapshot = stateRes?.data?.snapshot ?? {};
      const bot = stateRes?.data?.bot ?? {};

      // Update room name if not yet set
      if (!this._roomName) {
        this._roomName =
          snapshot.name ?? snapshot.roomName ?? snapshot.title ?? null;
      }

      // Update bot role from state
      if (bot.roomRole) {
        this._botRole = bot.roomRole;
        this._log("info", this.t("logs.bot.roomRole", { role: this._botRole }));
      }

      // Seed users from snapshot if available
      const users = snapshot.users ?? [];
      const joinStamp = Date.now();
      this._economyOnlineLast.clear();
      for (const u of users) {
        const uid = u.userId ?? u.user_id ?? u.id;
        if (uid != null) {
          const uidStr = String(uid);
          const displayName =
            u.displayName ?? u.display_name ?? u.username ?? null;
          this._roomUsersMap[uidStr] = displayName;
          this._roomUsers.set(uidStr, {
            userId: uidStr,
            publicId: u.publicId ?? u.id ?? null,
            username: u.username ?? null,
            displayName,
            role: u.role ?? "user",
            platformRole: u.platformRole ?? null,
            platformRoles: Array.isArray(u.platformRoles)
              ? u.platformRoles
              : [],
          });
          if (!this._userJoinAt.has(uidStr)) {
            this._userJoinAt.set(uidStr, joinStamp);
          }
          this._trackOnlineUser(uidStr);
          if (uidStr === String(this._userId)) {
            this._botRole = u.role ?? this._botRole ?? "user";
          }
        }
      }

      // Seed waitlist from snapshot if available
      const wl = snapshot.waitlist ?? snapshot.queue ?? [];
      if (Array.isArray(wl)) {
        const currentDjId = getSnapshotCurrentDjId(snapshot);
        const myIdx = wl.findIndex((u) => this._matchEntry(u));
        this._waitlistTotal = getWaitlistTotal(wl, { currentDjId });
        this._waitlistPosition = getWaitlistPositionForIndex(myIdx, wl, {
          currentDjId,
        });
        this._nextDjName = this._resolveName(
          getNextDjEntry(wl, { currentDjId }),
        );
      }

      // Seed last-known trackId so the room_state_snapshot handler won't
      // fire a spurious _onDjAdvance for the already-playing track.
      const pb = snapshot.playback ?? null;
      if (pb?.trackId) {
        this._lastKnownTrackId = pb.trackId;
        // Also populate _currentTrack / _djId from the HTTP snapshot
        this._currentTrack = {
          title: pb.title ?? null,
          artist: pb.artist ?? null,
          source: pb.source ?? null,
          sourceId: pb.sourceId ?? null,
          duration: pb.durationMs ?? null,
          youtubeId: pb.sourceId ?? null,
          link: null,
        };
        this._djId = pb.djId ?? null;
        this._djName = pb.djUsername ?? null;
        if (!this._currentTrackStartedAt) {
          this._currentTrackStartedAt = pb.startedAtServerMs ?? Date.now();
        }
      }
    } catch (err) {
      this._log("warn", this.t("logs.bot.joinFailed", { error: err.message }));
    }

    this._log(
      "info",
      this.t("logs.bot.joinedRoom", { room: this._roomName ?? this.cfg.room }),
    );

    this._startEconomyOnlineTimer();
    this._startPeriodicWaitlistSnapshot();
    startAutoRoulette(this, this._api);
    startAutoLiveEvents(this);

    if (!this._isReconnecting) {
      try {
        const name = this._displayName ?? this._username ?? "Bot";
        const res = await this.sendChat(
          this.t("logs.bot.onlineAnnouncement", {
            name,
            version: BOT_VERSION,
          }),
        );
        const delayMs = Number(this.cfg.deleteCommandMessagesDelayMs ?? 0);
        if (delayMs > 0) {
          const msg = res?.data?.data?.message ?? res?.data?.message ?? null;
          const sentId =
            msg?.id ?? res?.data?.data?.id ?? res?.data?.id ?? null;
          if (sentId) this.scheduleMessageDelete(sentId, delayMs);
        }
      } catch (err) {
        this._log(
          "warn",
          this.t("logs.bot.onlineAnnounceFailed", { error: err.message }),
        );
      }
    }

    this._isReconnecting = false;

    // Ensure snapshot-driven handlers (e.g. user-sync) always run at least
    // once, even if WS snapshot delivery is delayed right after join.
    this.events
      .dispatch(Events.ROOM_STATE_SNAPSHOT, this._buildEventCtx(), snapshot)
      .catch(() => {});

    this._refreshWaitlist().catch(() => {});
  }

  // ── Pipeline event handlers ────────────────────────────────────────────────

  _onDjAdvance(data) {
    if (this._voteSkipState?.timeoutId) {
      clearTimeout(this._voteSkipState.timeoutId);
    }
    this._voteSkipState = null;

    const prevTrack = this._currentTrack;
    const prevDjId = this._djId;
    const prevDjName = this._djName;

    // Payload may come from:
    //  a) room_state_snapshot path — has data.media / data.dj (normalised above)
    //  b) track_started WS event (if the server ever adds it)
    const media =
      data?.media ??
      data?.track ??
      data?.song ??
      data?.playback?.media ??
      data?.playback?.track ??
      data?.currentMedia ??
      data?.current_media ??
      {};

    const dj =
      data?.dj ??
      data?.user ??
      data?.playback?.dj ??
      data?.playback?.user ??
      data?.currentDj ??
      data?.current_dj ??
      {};

    this._djId = dj.userId ?? dj.user_id ?? dj.id ?? null;
    this._djName =
      dj.displayUsername ??
      dj.displayName ??
      dj.display_name ??
      dj.username ??
      null;
    this._currentTrack = {
      title: media.title ?? null,
      artist: media.artist ?? media.artistName ?? media.artist_name ?? null,
      duration: media.duration ?? media.length ?? null,
      source: media.source ?? media.platform ?? null,
      sourceId:
        media.sourceId ??
        media.source_id ??
        media.cid ??
        media.videoId ??
        media.video_id ??
        null,
      youtubeId:
        media.sourceId ??
        media.source_id ??
        media.youtubeId ??
        media.youtube_id ??
        media.cid ??
        media.videoId ??
        media.video_id ??
        null,
      link:
        media.link ??
        media.url ??
        media.sourceUrl ??
        media.source_url ??
        media.uri ??
        media.permalink ??
        media.permalink_url ??
        media.videoUrl ??
        media.video_url ??
        null,
    };
    this._currentTrackStartedAt = Date.now();

    this._clearAutoSkipTimer();

    // Intentionally no log here to avoid console spam.

    // Flush per-track reaction counters into session totals
    this._reactions.woots += this._currentReactions.woots;
    this._reactions.mehs += this._currentReactions.mehs;
    this._reactions.grabs += this._currentReactions.grabs;
    this._currentReactions = { woots: 0, mehs: 0, grabs: 0 };

    if (this._paused) return;

    this._scheduleAutoSkip();

    this._refreshWaitlist().catch(() => {});

    if (this.cfg.autoWoot) {
      setTimeout(() => this._castVote(), WOOT_DELAY_MS);
    }

    setTimeout(() => this._checkTrackBlacklist(), 1200);

    this._songCount++;
    this._maybeSendIntervalMessage().catch(() => {});

    this._recordTrackHistory(prevTrack, prevDjId, prevDjName).catch((e) =>
      this._log("warn", `[recordTrackHistory] ${e.message}`),
    );
    this._recordDjPlay(dj).catch((e) =>
      this._log("warn", `[recordDjPlay] ${e.message}`),
    );
    this._recordSongPlay(this._currentTrack).catch((e) =>
      this._log("warn", `[recordSongPlay] ${e.message}`),
    );

    this.events
      .dispatch(Events.ROOM_DJ_ADVANCE, this._buildEventCtx(), data)
      .catch(() => {});
  }

  _onWaitlistLeave(data) {
    const leftId = data?.userId ?? data?.user_id;
    const isMe =
      (this._userId && String(leftId) === String(this._userId)) ||
      (this._username &&
        (data?.username ?? "").toLowerCase() === this._username.toLowerCase());

    if (isMe) this._waitlistPosition = null;

    // Immediately persist last_left_at for the leaving user.  This runs
    // synchronously before any async event dispatch so the DB is updated
    // even if a snapshot event fires and re-queries the queue before the
    // user's absence is reflected in the REST API.
    if (leftId) {
      markWaitlistUserLeft(String(leftId), {
        roomSlug: this.cfg.room,
        username: data?.username ?? null,
      }).catch(() => {});
    }

    if (!this._paused) {
      this.events
        .dispatch(Events.ROOM_WAITLIST_LEAVE, this._buildEventCtx(), data)
        .catch(() => {});
    }
  }

  _onWaitlistUpdate(data) {
    const wl = data?.waitlist ?? data?.queue ?? [];
    if (Array.isArray(wl)) {
      const currentDjId = this._djId ?? getSnapshotCurrentDjId(data);
      const myIdx = wl.findIndex((u) => this._matchEntry(u));
      this._waitlistTotal = getWaitlistTotal(wl, { currentDjId });
      this._waitlistPosition = getWaitlistPositionForIndex(myIdx, wl, {
        currentDjId,
      });
      this._nextDjName = this._resolveName(getNextDjEntry(wl, { currentDjId }));
    }

    if (!this._paused) {
      this.events
        .dispatch(Events.ROOM_WAITLIST_UPDATE, this._buildEventCtx(), data)
        .catch(() => {});
    }
  }

  _onVote(data) {
    if (data?.woots != null) this._currentReactions.woots = data.woots;
    if (data?.mehs != null) this._currentReactions.mehs = data.mehs;
    if (this._paused) return;
    this._recordWootStats(data).catch(() => {});
  }

  _onGrab(data) {
    if (data?.grabs != null) this._currentReactions.grabs = data.grabs;
    else this._currentReactions.grabs++;
  }

  _onRoomUserJoin(data) {
    const uid = String(data?.userId ?? data?.user_id ?? data?.id ?? "");
    if (!uid) return;

    const displayName =
      data?.displayName ?? data?.display_name ?? data?.username ?? null;
    this._roomUsersMap[uid] = displayName;
    this._roomUsers.set(uid, {
      userId: uid,
      publicId: data?.publicId ?? data?.id ?? null,
      username: data?.username ?? null,
      displayName,
      role: data?.role ?? "user",
      platformRole: data?.platformRole ?? null,
      platformRoles: Array.isArray(data?.platformRoles)
        ? data.platformRoles
        : [],
    });
    this.setUserJoinAt(uid);
    this._trackOnlineUser(uid);

    // Dispatch to event handlers (e.g. greet)
    if (!this._paused) {
      this.events
        .dispatch(Events.ROOM_USER_JOIN, this._buildEventCtx(), data)
        .catch(() => {});
    }
  }

  _onRoomUserLeave(data) {
    const uid = String(data?.userId ?? data?.user_id ?? data?.id ?? "");
    if (uid) {
      // Capture username before removing from _roomUsers so we can use it
      // as a fallback key in markWaitlistUserLeft when waitlist_state stores
      // a session-scoped internalId instead of the stable platform userId.
      const username =
        this._roomUsers.get(uid)?.username ?? data?.username ?? null;
      this._roomUsers.delete(uid);
      this._userJoinAt.delete(uid);
      this._untrackOnlineUser(uid).catch(() => {});
      markWaitlistUserLeft(uid, {
        roomSlug: this.cfg.room,
        username,
      }).catch(() => {});
    }

    if (!this._paused) {
      this.events
        .dispatch(Events.ROOM_USER_LEAVE, this._buildEventCtx(), data)
        .catch(() => {});
    }
  }

  _onRoomUserRoleUpdate(data) {
    const uid = String(data?.userId ?? data?.user_id ?? data?.id ?? "");
    const newRole = data?.role ?? "user";
    if (!uid) return;

    const existing = this._roomUsers.get(uid);
    if (existing) existing.role = newRole;

    if (uid === String(this._userId)) {
      this._botRole = newRole;
      this._log(
        "info",
        this.t("logs.bot.roleUpdated", { role: this._botRole }),
      );
    }
  }

  _onRoomUserUpdate(data) {
    const uid = String(data?.userId ?? data?.user_id ?? data?.id ?? "");
    if (!uid) return;

    const existing = this._roomUsers.get(uid);
    if (!existing) return;

    if (data?.role != null) {
      existing.role = data.role;
      if (uid === String(this._userId)) {
        this._botRole = data.role;
      }
    }
    if (data?.platformRole !== undefined)
      existing.platformRole = data.platformRole ?? null;
    if (Array.isArray(data?.platformRoles))
      existing.platformRoles = data.platformRoles;
    if (data?.publicId != null) existing.publicId = data.publicId;
    if (data?.username != null) existing.username = data.username;
    if (data?.displayName != null) existing.displayName = data.displayName;
    else if (data?.display_name != null)
      existing.displayName = data.display_name;

    this._roomUsersMap[uid] = existing.displayName;

    if (!this._paused) {
      this.events
        .dispatch(Events.ROOM_USER_UPDATE, this._buildEventCtx(), data)
        .catch(() => {});
    }
  }

  _onChatMessage(data) {
    // Skip own messages
    if (
      (this._userId &&
        String(data?.userId ?? data?.user_id) === String(this._userId)) ||
      (this._username &&
        (data?.username ?? "").toLowerCase() === this._username.toLowerCase())
    ) {
      return;
    }

    const content = data?.message ?? data?.content ?? "";
    const messageId = data?.id ?? data?.messageId ?? data?.message_id ?? null;
    const sender = {
      userId: data?.userId ?? data?.user_id ?? null,
      username: data?.username ?? null,
      displayName:
        data?.displayName ?? data?.display_name ?? data?.username ?? null,
    };

    if (sender.userId != null) {
      this.setUserLastChatAt(sender.userId);
      if (messageId) this._trackChatMessage(String(sender.userId), messageId);

      // Patch the cached user entry with platformRole from the chat message.
      // This ensures global roles are applied even if the user joined before
      // the bot started (snapshot may have omitted platformRole).
      const _uid = String(sender.userId);
      const _cached = this._roomUsers.get(_uid);
      if (_cached && data?.platformRole !== undefined) {
        _cached.platformRole = data.platformRole ?? null;
      }
      if (_cached && Array.isArray(data?.platformRoles)) {
        _cached.platformRoles = data.platformRoles;
      }
    }

    // ── Auto-delete (simulated mute fallback) ────────────────────────────────
    const _senderUid = sender.userId != null ? String(sender.userId) : null;
    if (_senderUid && this._shouldAutoDelete(_senderUid)) {
      this.scheduleMessageDelete(messageId);
      return;
    }

    // ── Lock chat ───────────────────────────────────────────────────────────
    if (this.cfg.lockChatEnabled && _senderUid) {
      const _minLevel = getRoleLevel(this.cfg.lockChatMinRole ?? "resident_dj");
      if (this.getUserRoleLevel(_senderUid) < _minLevel) {
        this.scheduleMessageDelete(messageId);
        return;
      }
    }

    // ── Command dispatch ──────────────────────────────────────────────────
    const prefix = this.cfg.cmdPrefix;
    if (content.startsWith(prefix)) {
      const withoutPrefix = content.slice(prefix.length).trimStart();
      const spaceIdx = withoutPrefix.indexOf(" ");
      const name =
        spaceIdx === -1
          ? withoutPrefix.toLowerCase()
          : withoutPrefix.slice(0, spaceIdx).toLowerCase();
      const rawArgs =
        spaceIdx === -1 ? "" : withoutPrefix.slice(spaceIdx + 1).trim();
      const args = this._tokenizeCommandArgs(rawArgs);

      if (name) {
        const debugAllowedIds = new Set(this.cfg.debugCommandUserIds ?? []);
        if (
          this.cfg.debug &&
          debugAllowedIds.size > 0 &&
          !_senderUid?.startsWith("room-bot:") &&
          !debugAllowedIds.has(String(_senderUid ?? ""))
        ) {
          return;
        }
        if (this._paused && !PAUSED_COMMAND_ALLOWLIST.has(name)) return;
        const ctx = this._buildCtx({
          sender,
          args,
          rawArgs,
          message: content,
          messageId,
        });
        const senderLabel =
          sender.displayName ?? sender.username ?? String(sender.userId ?? "?");
        const argPreview = rawArgs ? ` ${rawArgs}` : "";
        this._log(
          "info",
          `[cmd] ${senderLabel} -> ${prefix}${name}${argPreview}`,
        );
        const cmdDef = this.commands.resolve(name);
        if (cmdDef && this.cfg.deleteCommandMessagesEnabled) {
          const delayMs = Number(this.cfg.deleteCommandMessagesDelayMs ?? 0);
          this.scheduleMessageDelete(messageId, delayMs);
        }
        this.commands
          .dispatch(ctx, name)
          .then(() => {
            this._log("debug", `[cmd] ${name} ok`);
          })
          .catch((err) =>
            this._log(
              "warn",
              this.t("logs.bot.commandError", {
                command: name,
                error: err.message,
              }),
            ),
          );

        if (!this._paused) {
          this.events
            .dispatch(Events.ROOM_CHAT_MESSAGE, this._buildEventCtx(), {
              ...data,
              sender,
            })
            .catch(() => {});
        }
      }
      return;
    }

    // ── Bot-mention reply ─────────────────────────────────────────────────
    if (this._paused) return;
    if (this.cfg.botMessage) {
      this._checkMention(content, sender);
    }

    // ── Dispatch to event handlers ────────────────────────────────────────
    this.events
      .dispatch(Events.ROOM_CHAT_MESSAGE, this._buildEventCtx(), {
        ...data,
        sender,
      })
      .catch(() => {});
  }

  // ── REST actions ───────────────────────────────────────────────────────────

  async _castVote() {
    // The Wavez platform does not yet expose a vote/woot command via WebSocket
    // or REST for room bots. This is a known limitation. Auto-woot remains a
    // no-op until the platform ships the endpoint.
  }

  async _refreshWaitlist() {
    try {
      const stateRes = await this._api.roomBot.getState(this._roomId);
      const snapshot = stateRes?.data?.snapshot ?? {};

      const users = snapshot.users ?? [];
      for (const u of users) {
        const uid = u.userId ?? u.user_id ?? u.id;
        if (uid != null) {
          const uidStr = String(uid);
          const displayName =
            u.displayName ?? u.display_name ?? u.username ?? null;
          this._roomUsersMap[uidStr] = displayName;
          if (!this._roomUsers.has(uidStr)) {
            this._roomUsers.set(uidStr, {
              userId: uidStr,
              publicId: u.publicId ?? u.id ?? null,
              username: u.username ?? null,
              displayName,
              role: u.role ?? "user",
              platformRole: u.platformRole ?? null,
              platformRoles: Array.isArray(u.platformRoles)
                ? u.platformRoles
                : [],
            });
          }
          if (!this._userJoinAt.has(uidStr)) {
            this._userJoinAt.set(uidStr, Date.now());
          }
        }
      }

      const wl = snapshot.waitlist ?? snapshot.queue ?? [];
      if (Array.isArray(wl)) {
        const currentDjId = this._djId ?? getSnapshotCurrentDjId(snapshot);
        const myIdx = wl.findIndex((u) => this._matchEntry(u));
        this._waitlistTotal = getWaitlistTotal(wl, { currentDjId });
        this._waitlistPosition = getWaitlistPositionForIndex(myIdx, wl, {
          currentDjId,
        });
        this._nextDjName = this._resolveName(
          getNextDjEntry(wl, { currentDjId }),
        );
      }
    } catch {
      // non-critical
    }
  }

  // ── Bot-mention reply ──────────────────────────────────────────────────────

  _checkMention(content, sender) {
    if (/\bafk\b/i.test(content)) return;
    const lower = content.toLowerCase();
    const username = (this._username ?? "").toLowerCase();
    const displayName = (this._displayName ?? "").toLowerCase();

    const mentioned =
      (username && lower.includes(`@${username}`)) ||
      (displayName && lower.includes(`@${displayName}`));

    if (!mentioned) return;

    const now = Date.now();
    if (now - this._mentionLastReply < this.cfg.botMentionCooldownMs) return;
    this._mentionLastReply = now;

    const baseMessage = this.localizeValue(this.cfg.botMessage);
    const messageText = String(baseMessage ?? "").trim();
    if (!messageText) return;

    const senderTag = sender.username ?? sender.displayName ?? "";
    const reply = senderTag ? `@${senderTag} ${messageText}` : messageText;

    this.sendChat(reply).catch((err) =>
      this._log(
        "warn",
        this.t("logs.bot.mentionFailed", { error: err.message }),
      ),
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Send a chat message in the current room. */
  async sendChat(content) {
    if (!this._api?.roomBot?.sendMessage) return null;
    return this._api.roomBot.sendMessage(this._roomId, { content });
  }

  /**
   * Edit a previously sent chat message.
   * Falls back to sendChat if the message is not found or editing fails.
   * @param {string} messageId
   * @param {string} content
   */
  async editChat(messageId, content) {
    const id = messageId != null ? String(messageId).trim() : "";
    if (!id || !this._api?.roomBot?.editMessage) return this.sendChat(content);

    try {
      return await this._api.roomBot.editMessage(this._roomId, id, { content });
    } catch {
      return this.sendChat(content);
    }
  }

  /**
   * Extract a message ID from a sendChat / sendReply response.
   * @param {unknown} res
   * @returns {string|null}
   */
  static getMsgId(res) {
    const msg =
      res?.data?.data?.message ??
      res?.data?.message ??
      res?.data?.data ??
      res?.data ??
      null;
    return msg?.id ?? null;
  }

  /**
   * Send a chat message as a reply to a specific message.
   * Falls back to sendChat if the message was deleted.
   * @param {string} content
   * @param {string|null} messageId  — id of the message to reply to
   */
  async sendReply(content, messageId) {
    if (!this._api?.roomBot?.sendMessage) return null;
    const body = { content };
    if (messageId) {
      body.replyTo = { id: String(messageId) };
      try {
        return await this._api.roomBot.sendMessage(this._roomId, body);
      } catch (err) {
        // If the message was deleted/not found, fall back to regular chat message
        if (err?.response?.status === 404 || err?.code === "NOT_FOUND") {
          return this.sendChat(content);
        }
        throw err;
      }
    }
    return this._api.roomBot.sendMessage(this._roomId, body);
  }

  // ── Chat message cache helpers ────────────────────────────────────────────

  /** @private */
  _trackChatMessage(userId, messageId) {
    if (!userId || !messageId) return;
    let msgs = this._chatMessages.get(userId);
    if (!msgs) {
      msgs = [];
      this._chatMessages.set(userId, msgs);
    }
    msgs.push(String(messageId));
    if (msgs.length > 150) msgs.shift();
  }

  /** @private */
  _shouldAutoDelete(userId) {
    const expiresAt = this._autoDeleteUsers.get(userId);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      this._autoDeleteUsers.delete(userId);
      return false;
    }
    return true;
  }

  /**
   * Delete all cached messages from a specific user.
   * @returns {number} count of messages deleted
   */
  deleteMessagesFromUser(userId) {
    const uid = String(userId ?? "");
    if (!uid) return 0;
    const msgs = this._chatMessages.get(uid) ?? [];
    let count = 0;
    for (const id of msgs) {
      this.scheduleMessageDelete(id);
      count++;
    }
    this._chatMessages.set(uid, []);
    return count;
  }

  /**
   * Delete all cached messages from every user (nuke).
   * @returns {number} count of messages deleted
   */
  deleteAllCachedMessages() {
    let count = 0;
    for (const msgs of this._chatMessages.values()) {
      for (const id of msgs) {
        this.scheduleMessageDelete(id);
        count++;
      }
    }
    this._chatMessages.clear();
    return count;
  }

  /**
   * Start auto-deleting all future messages from a user for durationMs.
   * Also immediately deletes any cached messages from them.
   */
  startAutoDeletingUser(userId, durationMs) {
    const uid = String(userId ?? "");
    if (!uid || !(durationMs > 0)) return;
    this._autoDeleteUsers.set(uid, Date.now() + durationMs);
    this.deleteMessagesFromUser(uid);
  }

  /** Cancel auto-delete for a user before its natural expiry. */
  stopAutoDeletingUser(userId) {
    this._autoDeleteUsers.delete(String(userId ?? ""));
  }

  /**
   * Start a duel-specific mute: marks the user in _duelMutedUsers so it can
   * be targeted exclusively by !clearduel without affecting regular mutes.
   */
  startDuelMute(userId, durationMs) {
    const uid = String(userId ?? "");
    if (!uid || !(durationMs > 0)) return;
    this._duelMutedUsers.add(uid);
    this.startAutoDeletingUser(uid, durationMs);
    // Auto-remove from duel set when the mute naturally expires
    setTimeout(() => this._duelMutedUsers.delete(uid), durationMs);
  }

  /** Remove duel mute for a specific user (leaves regular mutes untouched). */
  clearDuelMute(userId) {
    const uid = String(userId ?? "");
    if (this._duelMutedUsers.has(uid)) {
      this._duelMutedUsers.delete(uid);
      this.stopAutoDeletingUser(uid);
      return true;
    }
    return false;
  }

  /** Remove duel mute for ALL currently duel-muted users. */
  clearAllDuelMutes() {
    for (const uid of this._duelMutedUsers) {
      this.stopAutoDeletingUser(uid);
    }
    this._duelMutedUsers.clear();
  }

  /** Schedule deletion of a chat message in the current room. */
  scheduleMessageDelete(messageId, delayMs = 0) {
    const id = messageId != null ? String(messageId).trim() : "";
    if (!id || !this._api?.roomBot?.deleteMessage) return false;

    const delay = Math.max(0, Number(delayMs) || 0);
    const run = () => {
      this._api.roomBot.deleteMessage(this._roomId, id).catch(() => {});
    };

    if (delay > 0) setTimeout(run, delay);
    else run();
    return true;
  }

  /** Skip the current track with a mutex to avoid multi-skip races. */
  async safeSkip({ message, onErrorKey, deleteMs: deleteMsOpt } = {}) {
    const key =
      this.getCurrentTrackId() ??
      this._currentTrack?.title ??
      String(this._currentTrackStartedAt ?? "");
    const now = Date.now();

    if (this._skipMutex.inFlight) return false;
    if (
      key &&
      this._skipMutex.lastKey === key &&
      now - this._skipMutex.lastAt < 5000
    ) {
      return false;
    }

    this._skipMutex.inFlight = true;
    this._skipMutex.lastKey = key;
    this._skipMutex.lastAt = now;

    try {
      if (message) {
        const res = await this.sendChat(message);
        const deleteMs =
          deleteMsOpt != null
            ? Number(deleteMsOpt)
            : Number(this.cfg.deleteCommandMessagesDelayMs);
        if (deleteMs > 0) {
          const sentMsg =
            res?.data?.data?.message ?? res?.data?.message ?? null;
          const sentId =
            sentMsg?.id ?? res?.data?.data?.id ?? res?.data?.id ?? null;
          if (sentId) this.scheduleMessageDelete(sentId, deleteMs);
        }
      }
      // Use the WebSocket skip command (authoritative) when connected;
      // fall back to the REST shim if the pipeline is not available.
      if (this._pipeline) {
        this._pipeline.send("skip", { roomId: this._roomId });
      } else if (this._api?.roomBot?.updateSettings) {
        await this._api.roomBot.updateSettings(this._roomId, {
          commandAnnouncement: { commandId: "skip" },
        });
      }
      return true;
    } catch (err) {
      if (onErrorKey) {
        this._log("warn", this.t(onErrorKey, { error: err.message }));
      }
      return false;
    } finally {
      this._skipMutex.inFlight = false;
    }
  }

  // ── WebSocket command helpers ───────────────────────────────────────────────

  /**
   * Remove a user from the waitlist via the WebSocket `remove_from_queue` command.
   * @param {string} userId
   */
  wsRemoveFromQueue(userId) {
    if (!this._pipeline) return false;
    this._pipeline.send("remove_from_queue", {
      roomId: this._roomId,
      targetUserId: String(userId),
    });
    return true;
  }

  /**
   * Move a user to a specific zero-based position in the waitlist via WS.
   * The WS API expects a one-based target position, so we convert here.
   * @param {string} userId
   * @param {number} position  Zero-based index
   */
  wsReorderQueue(userId, position) {
    if (!this._pipeline) return false;
    const zeroBased = Math.trunc(Number(position));
    const oneBased = Math.max(1, zeroBased + 1);
    this._pipeline.send("reorder_queue", {
      roomId: this._roomId,
      targetUserId: String(userId),
      toPosition: oneBased,
    });
    return true;
  }

  /**
   * Ban a user via the WebSocket `ban_user` command.
   * @param {string} userId
   * @param {{ duration?: number, reason?: string }} [opts]
   */
  wsBanUser(userId, opts = {}) {
    if (!this._pipeline) return false;
    const payload = { roomId: this._roomId, targetUserId: String(userId) };
    if (opts.duration != null) payload.duration = opts.duration;
    if (opts.reason) payload.reason = opts.reason;
    this._pipeline.send("ban_user", payload);
    return true;
  }

  /**
   * Kick a user via the WebSocket `kick_user` command.
   * @param {string} userId
   * @param {{ reason?: string }} [opts]
   */
  wsKickUser(userId, opts = {}) {
    if (!this._pipeline) return false;
    const payload = { roomId: this._roomId, targetUserId: String(userId) };
    if (opts.reason) payload.reason = opts.reason;
    this._pipeline.send("kick_user", payload);
    return true;
  }

  /**
   * Mute a user via the WebSocket `mute_user` command.
   * Also activates client-side auto-delete as a supplement.
   * @param {string} userId
   * @param {number} [durationMs]  Duration in ms; 0 = until manually unmuted
   */
  wsMuteUser(userId, durationMs = 0) {
    if (!userId) return false;
    const uid = String(userId);
    const payload = { roomId: this._roomId, targetUserId: uid };
    if (durationMs > 0) payload.durationMs = durationMs;
    if (this._pipeline) this._pipeline.send("mute_user", payload);
    // Supplement with client-side auto-delete so messages are cleared even if
    // the server-side mute has a latency window.
    if (durationMs > 0) {
      this.startAutoDeletingUser(uid, durationMs);
    } else {
      this.startAutoDeletingUser(uid, 24 * 60 * 60 * 1000);
    }
    return true;
  }

  /**
   * Unmute a user (client-side auto-delete removed; no WS unmute command available).
   * @param {string} userId
   */
  wsUnmuteUser(userId) {
    if (!userId) return false;
    this.stopAutoDeletingUser(String(userId));
    return true;
  }

  /** Returns a stable track id like "youtube:abc123" if possible. */
  getCurrentTrackId() {
    const source = this._currentTrack?.source;
    const sourceId = this._currentTrack?.sourceId;
    if (source && sourceId) return `${source}:${sourceId}`;
    const yid = this._currentTrack?.youtubeId;
    if (yid) return `youtube:${yid}`;
    return null;
  }

  _clearAutoSkipTimer() {
    if (this._autoSkipTimer) {
      clearTimeout(this._autoSkipTimer);
      this._autoSkipTimer = null;
    }
    this._autoSkipTrackKey = null;
  }

  _scheduleAutoSkip() {
    if (!this.cfg.autoSkipEnabled) return;
    if (this._paused) return;

    const durationSec = Number(this._currentTrack?.duration ?? 0);
    if (!Number.isFinite(durationSec) || durationSec <= 0) return;

    const key =
      this.getCurrentTrackId() ??
      this._currentTrack?.title ??
      String(this._currentTrackStartedAt ?? "");
    if (!key) return;

    this._autoSkipTrackKey = key;
    const delay = Math.max(
      0,
      Math.floor(durationSec * 1000 + AUTO_SKIP_GRACE_MS),
    );
    this._autoSkipTimer = setTimeout(() => {
      this._runAutoSkip(key).catch(() => {});
    }, delay);
  }

  async _runAutoSkip(expectedKey) {
    if (!this.cfg.autoSkipEnabled) return;
    if (this._paused) return;

    const currentKey =
      this.getCurrentTrackId() ??
      this._currentTrack?.title ??
      String(this._currentTrackStartedAt ?? "");
    if (!currentKey || currentKey !== expectedKey) return;

    if (this.getBotRoleLevel() < getRoleLevel("bouncer")) return;

    await this.safeSkip({
      message: this.t("events.autoSkip.skip"),
    });
  }

  /** Update a runtime config key and apply side effects if needed. */
  updateConfig(key, value) {
    this.cfg[key] = value;

    if (key === "locale") {
      this._locale = normalizeLocale(value);
    }

    if (key === "greetEnabled") {
      if (value) this.events.enable("greet");
      else this.events.disable("greet");
    }

    if (key === "autoSkipEnabled" && !value) {
      this._clearAutoSkipTimer();
    }
  }

  /** Translate a message key using the current locale. */
  t(key, vars) {
    return translate(key, vars, this._locale);
  }

  /** Get an array message for the current locale. */
  tArray(key) {
    return translateArray(key, this._locale);
  }

  /** Resolve a config value that may be locale-specific. */
  localizeValue(value) {
    return resolveLocalizedValue(value, this._locale);
  }

  /** Seconds elapsed since the current track started. */
  getCurrentTrackElapsedSec() {
    if (!this._currentTrackStartedAt) return 0;
    return Math.max(
      0,
      Math.floor((Date.now() - this._currentTrackStartedAt) / 1000),
    );
  }

  async _maybeSendIntervalMessage() {
    if (!this._songCount) return;

    const list = Array.isArray(this.cfg.intervalMessages)
      ? this.cfg.intervalMessages
      : [];
    if (list.length === 0) return;

    if (this.cfg.motdEnabled) {
      const interval = Number(this.cfg.motdInterval) || 0;
      if (interval <= 0 || this._songCount % interval !== 0) return;
      const idx = this._songCount % list.length;
      const msg = String(this.localizeValue(list[idx]) ?? "").trim();
      if (msg) await this.sendChat(msg);
      return;
    }

    const interval = Number(this.cfg.messageInterval) || 0;
    if (interval <= 0) return;
    if (this._songCount % interval !== 0) return;
    const idx = this._songCount % list.length;
    const msg = String(this.localizeValue(list[idx]) ?? "").trim();
    if (msg) await this.sendChat(msg);
  }

  async _checkTrackBlacklist() {
    if (this.cfg.blacklistEnabled === false) return;
    const trackId = this.getCurrentTrackId();
    if (!trackId) return;
    let entry;
    try {
      entry = await getTrackBlacklist(trackId);
    } catch {
      return;
    }
    if (!entry) return;

    const title =
      entry.title ?? this._currentTrack?.title ?? this.t("common.song");
    const artist = entry.artist ?? this._currentTrack?.artist ?? "";
    const label = artist ? `${artist} - ${title}` : title;

    if (this.getBotRoleLevel() < getRoleLevel("bouncer")) {
      this._log("warn", this.t("logs.bot.blacklistNoPermission"));
      return;
    }

    await this.safeSkip({
      message: this.t("logs.bot.blacklistSkipMessage", { label }),
      onErrorKey: "logs.bot.blacklistSkipFailed",
    });
  }

  /**
   * Find a room user by username or displayName (case-insensitive, @ stripped).
   * @param {string} target
   * @returns {{userId:string, username:string, displayName:string, role:string}|null}
   */
  findRoomUser(target) {
    if (!target) return null;
    let normalized = String(target).trim();

    // Accept mentions with quotes, e.g. @"Nome Sobrenome" or "Nome Sobrenome".
    const hasAt = normalized.startsWith("@");
    if (hasAt) normalized = normalized.slice(1).trim();
    if (
      (normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'"))
    ) {
      normalized = normalized.slice(1, -1).trim();
    }

    const lower = normalized.toLowerCase();
    for (const u of this._roomUsers.values()) {
      if (
        (u.username ?? "").toLowerCase() === lower ||
        (u.displayName ?? "").toLowerCase() === lower
      ) {
        return u;
      }
    }
    return null;
  }

  /**
   * Split raw command arguments while preserving quoted segments.
   * Supports forms like: @"Nome Sobrenome" and "Nome Sobrenome".
   * @param {string} rawArgs
   * @returns {string[]}
   */
  _tokenizeCommandArgs(rawArgs) {
    const input = String(rawArgs ?? "").trim();
    if (!input) return [];

    const out = [];
    let current = "";
    let quote = null;

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];

      if (quote) {
        if (ch === quote) {
          quote = null;
        } else {
          current += ch;
        }
        continue;
      }

      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }

      if (/\s/.test(ch)) {
        if (current) {
          out.push(current);
          current = "";
        }
        continue;
      }

      current += ch;
    }

    if (current) out.push(current);
    return out;
  }

  /** Record the join time for a user if not already set. */
  setUserJoinAt(userId, at = Date.now()) {
    if (userId == null) return;
    const uid = String(userId);
    if (this.isBotUser(uid)) return;
    if (!this._userJoinAt.has(uid)) {
      const stamp = Number(at) || Date.now();
      this._userJoinAt.set(uid, stamp);
      this._queueAfkPersist(uid, { lastJoinAt: stamp });
    }
  }

  /** Join timestamp for a user, or null if unknown. */
  getUserJoinAt(userId) {
    if (userId == null) return null;
    return this._userJoinAt.get(String(userId)) ?? null;
  }

  /** Record a chat interaction timestamp for a user. */
  setUserLastChatAt(userId, at = Date.now()) {
    if (userId == null) return;
    if (this.isBotUser(userId)) return;
    const stamp = Number(at) || Date.now();
    this._lastChatAt.set(String(userId), stamp);
    this._queueAfkPersist(userId, { lastChatAt: stamp });
  }

  /** Last chat timestamp for a user, or null if none. */
  getLastChatAt(userId) {
    if (userId == null) return null;
    return this._lastChatAt.get(String(userId)) ?? null;
  }

  /** Last known interaction time (chat or join) for a user. */
  getLastActivityAt(userId) {
    if (userId == null) return null;
    return this.getLastChatAt(userId) ?? this.getUserJoinAt(userId);
  }

  // ── Economy / XP helpers ────────────────────────────────────────────────

  _getUserIdentity(userId, fallback = null) {
    const uid = userId != null ? String(userId) : "";
    const known = uid ? this._roomUsers.get(uid) : null;
    const username = fallback?.username ?? known?.username ?? null;
    const displayName = fallback?.displayName ?? known?.displayName ?? null;
    return { username, displayName };
  }

  _updateEconomyIdentity(userId, identity) {
    if (userId == null || !identity) return;
    const uid = String(userId);
    const prev = this._economyIdentity.get(uid) ?? {};
    const username = identity.username ?? prev.username ?? null;
    const displayName = identity.displayName ?? prev.displayName ?? null;
    this._economyIdentity.set(uid, { username, displayName });
  }

  _getXpRequirement(level) {
    const lvl = Math.max(1, Number(level) || 1);
    const base = Number(this.cfg.xpBase ?? 50);
    const exponent = Number(this.cfg.xpExponent ?? 1.3);
    const raw = Math.max(1, base) * Math.pow(lvl, Math.max(1, exponent));
    const scaled = toPointsInt(raw);
    return Math.max(1, scaled);
  }

  _getXpRewardPoints(level) {
    const base = Number(this.cfg.xpRewardBasePoints ?? 2);
    const step = Number(this.cfg.xpRewardStepPoints ?? 1);
    const lvl = Math.max(1, Number(level) || 1);
    const reward = base + step * lvl;
    return Number.isFinite(reward) ? reward : 0;
  }

  _getXpRewardMeta(level) {
    const lvl = String(Math.max(1, Number(level) || 1));
    const badges = this.cfg.xpBadgeRewards ?? {};
    const achievements = this.cfg.xpAchievementRewards ?? {};
    const badge =
      badges && typeof badges === "object" ? (badges[lvl] ?? null) : null;
    const achievement =
      achievements && typeof achievements === "object"
        ? (achievements[lvl] ?? null)
        : null;
    return { badge, achievement };
  }

  _queueProgressOp(task) {
    const run = this._progressLock.then(task, task);
    this._progressLock = run.catch(() => {});
    return run;
  }

  _recordChatReward(userId, cooldownMs) {
    const uid = String(userId ?? "");
    if (!uid) return false;
    const now = Date.now();
    const last = this._economyChatLast.get(uid) ?? 0;
    const cooldown = Math.max(0, Number(cooldownMs) || 0);
    if (cooldown && now - last < cooldown) return false;
    this._economyChatLast.set(uid, now);
    return true;
  }

  _recordTrackReward(map, userId, trackId) {
    const uid = String(userId ?? "");
    if (!uid || !trackId) return true;
    const last = map.get(uid);
    if (last === trackId) return false;
    map.set(uid, trackId);
    return true;
  }

  _resolveTrackId(track) {
    if (!track) return null;
    const source = track.source ?? null;
    const sourceId = track.sourceId ?? null;
    if (source && sourceId) return `${source}:${sourceId}`;
    const yid = track.youtubeId ?? null;
    if (yid) return `youtube:${yid}`;
    return null;
  }

  _normalizeLeaderboardReset() {
    const raw = String(this.cfg.leaderboardReset ?? "never")
      .trim()
      .toLowerCase();
    if (["daily", "weekly", "monthly", "never"].includes(raw)) return raw;
    return "never";
  }

  _getNextLeaderboardResetAt(lastResetAt, mode) {
    const base = new Date(Number(lastResetAt) || Date.now());
    if (mode === "daily") {
      const next = new Date(base);
      next.setHours(24, 0, 0, 0);
      return next.getTime();
    }
    if (mode === "weekly") {
      const next = new Date(base);
      const day = next.getDay();
      const daysUntilMonday = (8 - day) % 7 || 7;
      next.setDate(next.getDate() + daysUntilMonday);
      next.setHours(0, 0, 0, 0);
      return next.getTime();
    }
    if (mode === "monthly") {
      return new Date(base.getFullYear(), base.getMonth() + 1, 1).getTime();
    }
    return Number.POSITIVE_INFINITY;
  }

  async ensureLeaderboardReset() {
    const mode = this._normalizeLeaderboardReset();
    if (mode === "never") return false;

    const now = Date.now();
    if (
      now - this._leaderboardResetLastCheck <
      LEADERBOARD_RESET_CHECK_THROTTLE_MS
    ) {
      return false;
    }
    this._leaderboardResetLastCheck = now;

    if (this._leaderboardResetInFlight) return false;
    this._leaderboardResetInFlight = true;
    try {
      const lastResetAt = await getLeaderboardResetAt();
      if (!lastResetAt) {
        await setLeaderboardResetAt(now);
        return false;
      }
      const nextResetAt = this._getNextLeaderboardResetAt(lastResetAt, mode);
      if (now < nextResetAt) return false;
      await resetLeaderboards();
      await setLeaderboardResetAt(now);
      return true;
    } finally {
      this._leaderboardResetInFlight = false;
    }
  }

  async _recordTrackHistory(track, djId, djName) {
    if (!track) return;
    const trackId = this._resolveTrackId(track);
    if (!trackId && !track.title && !track.artist) return;
    await addTrackHistory({
      trackId,
      title: track.title ?? null,
      artist: track.artist ?? null,
      djId: djId ?? null,
      djName: djName ?? null,
      playedAt: Date.now(),
    });
  }

  async _recordDjPlay(dj) {
    const userId = dj?.userId ?? dj?.user_id ?? dj?.id ?? null;
    if (userId == null || this.isBotUser(userId)) return;
    await this.ensureLeaderboardReset();
    const identity = {
      username: dj?.username ?? null,
      displayName: dj?.displayName ?? dj?.display_name ?? null,
    };
    await incrementUserDjPlay(userId, identity, 1);
  }

  async _recordSongPlay(track) {
    const trackId = this._resolveTrackId(track);
    if (!trackId) return;
    await this.ensureLeaderboardReset();
    await incrementSongPlay({
      trackId,
      source: track.source ?? null,
      sourceId: track.sourceId ?? null,
      title: track.title ?? null,
      artist: track.artist ?? null,
      lastPlayedAt: Date.now(),
    });
  }

  _getVoteValue(data) {
    const vote = data?.vote ?? data?.direction ?? data?.value ?? data?.type;
    if (typeof vote === "number") return vote;
    const text = String(vote ?? "").toLowerCase();
    if (["woot", "up", "like", "1", "true"].includes(text)) return 1;
    if (["meh", "down", "dislike", "-1", "false"].includes(text)) return -1;
    if (data?.woot === true) return 1;
    if (data?.meh === true) return -1;
    return 0;
  }

  _getVoteUserId(data) {
    const user = data?.user ?? data?.voter ?? data?.sender ?? null;
    return (
      data?.userId ??
      data?.user_id ??
      user?.userId ??
      user?.user_id ??
      user?.id ??
      data?.id ??
      null
    );
  }

  async _recordWootStats(data) {
    const voteValue = this._getVoteValue(data);
    if (voteValue <= 0) return;

    const userId = this._getVoteUserId(data);
    if (userId == null || this.isBotUser(userId)) return;

    const trackId =
      this.getCurrentTrackId() ?? this._resolveTrackId(this._currentTrack);
    if (!this._recordTrackReward(this._leaderboardVoteTrack, userId, trackId)) {
      return;
    }

    await this.ensureLeaderboardReset();

    const identity = this._getUserIdentity(userId, data?.user ?? data?.sender);
    await incrementUserWoot(userId, identity, 1);

    if (trackId) {
      const track = this._currentTrack ?? {};
      await incrementSongWoot({
        trackId,
        source: track.source ?? null,
        sourceId: track.sourceId ?? null,
        title: track.title ?? null,
        artist: track.artist ?? null,
        lastPlayedAt: Date.now(),
      });
    }
  }

  async _ensureEconomyBalance(userId, identity = null) {
    const uid = String(userId ?? "");
    if (!uid) return 0;
    if (!this._economyBalances.has(uid)) {
      const balance = Number(await getEconomyBalance(uid).catch(() => 0)) || 0;
      this._economyBalances.set(uid, balance);
    }
    if (identity) this._updateEconomyIdentity(uid, identity);
    return this._economyBalances.get(uid) ?? 0;
  }

  async _ensureXpState(userId, identity = null) {
    const uid = String(userId ?? "");
    if (!uid) return { level: 1, xp: 0, xpTotal: 0 };
    if (!this._xpStates.has(uid)) {
      const row = await getXpState(uid).catch(() => null);
      const state = {
        level: Math.max(1, Number(row?.level ?? 1) || 1),
        xp: Number(row?.xp ?? 0) || 0,
        xpTotal: Number(row?.xpTotal ?? 0) || 0,
      };
      this._xpStates.set(uid, state);
      if (row?.username || row?.displayName) {
        this._economyIdentity.set(uid, {
          username: row?.username ?? null,
          displayName: row?.displayName ?? null,
        });
      }
    }
    if (identity) this._updateEconomyIdentity(uid, identity);
    return this._xpStates.get(uid);
  }

  _queueEconomyPersist(userId) {
    if (userId == null) return;
    const uid = String(userId);
    this._economyPersistQueue.add(uid);
    this._scheduleEconomyPersistFlush();
  }

  _queueXpPersist(userId) {
    if (userId == null) return;
    const uid = String(userId);
    this._xpPersistQueue.add(uid);
    this._scheduleEconomyPersistFlush();
  }

  _scheduleEconomyPersistFlush() {
    if (
      this._economyPersistQueue.size === 0 &&
      this._xpPersistQueue.size === 0
    ) {
      if (this._economyPersistTimer) clearTimeout(this._economyPersistTimer);
      this._economyPersistTimer = null;
      this._economyPersistTimerAt = 0;
      return;
    }

    const dueAt = Date.now() + ECONOMY_PERSIST_THROTTLE_MS;
    if (this._economyPersistTimer && this._economyPersistTimerAt <= dueAt)
      return;

    if (this._economyPersistTimer) clearTimeout(this._economyPersistTimer);
    const delay = Math.max(0, dueAt - Date.now());
    this._economyPersistTimerAt = dueAt;
    this._economyPersistTimer = setTimeout(() => {
      this._flushEconomyPersist().catch(() => {});
    }, delay);
  }

  async _flushEconomyPersist(force = false) {
    if (
      this._economyPersistQueue.size === 0 &&
      this._xpPersistQueue.size === 0
    ) {
      return 0;
    }
    if (this._economyPersistInFlight && !force) return 0;
    this._economyPersistInFlight = true;

    const economyIds = [...this._economyPersistQueue];
    const xpIds = [...this._xpPersistQueue];
    this._economyPersistQueue.clear();
    this._xpPersistQueue.clear();

    try {
      for (const uid of economyIds) {
        const balance = this._economyBalances.get(uid) ?? 0;
        const identity = this._economyIdentity.get(uid) ?? {};
        await setEconomyBalance(uid, balance, identity);
      }
      for (const uid of xpIds) {
        const state = this._xpStates.get(uid);
        if (!state) continue;
        const identity = this._economyIdentity.get(uid) ?? {};
        await setXpState({ userId: uid, ...state, ...identity });
      }
    } catch {
      const retryAt = Date.now() + ECONOMY_PERSIST_RETRY_MS;
      for (const uid of economyIds) this._economyPersistQueue.add(uid);
      for (const uid of xpIds) this._xpPersistQueue.add(uid);
      if (this._economyPersistTimer) clearTimeout(this._economyPersistTimer);
      const delay = Math.max(0, retryAt - Date.now());
      this._economyPersistTimerAt = retryAt;
      this._economyPersistTimer = setTimeout(() => {
        this._flushEconomyPersist().catch(() => {});
      }, delay);
    } finally {
      this._economyPersistInFlight = false;
    }

    if (this._economyPersistQueue.size || this._xpPersistQueue.size) {
      this._scheduleEconomyPersistFlush();
    }
    return economyIds.length + xpIds.length;
  }

  async getEconomyBalance(userId, identity = null) {
    const uid = String(userId ?? "");
    if (!uid) return 0;
    return this._ensureEconomyBalance(uid, identity);
  }

  async getVipEconomyMultiplier(userId, source = "general", identity = null) {
    const benefits = await this.getVipBenefits(userId, identity);
    switch (String(source ?? "general").toLowerCase()) {
      case "daily":
        return Math.max(1, Number(benefits.dailyMultiplier ?? 1) || 1);
      case "work":
        return Math.max(1, Number(benefits.workMultiplier ?? 1) || 1);
      case "chat":
      case "dj":
      case "grab":
      case "vote":
      case "online":
      case "economy":
        return Math.max(1, Number(benefits.economyMultiplier ?? 1) || 1);
      default:
        return 1;
    }
  }

  async getVipAdjustedShopPriceInt(
    userId,
    amount,
    identity = null,
    options = {},
  ) {
    const baseInt = toPointsInt(amount);
    if (!baseInt) return 0;
    if (options?.applyVipDiscount === false) return baseInt;
    if (String(options?.itemType ?? "").toLowerCase() === "vip") return baseInt;

    const benefits = await this.getVipBenefits(userId, identity);
    const discountPct = Math.max(
      0,
      Math.min(90, Number(benefits.shopDiscountPct ?? 0) || 0),
    );
    if (!discountPct) return baseInt;
    return Math.max(0, Math.round((baseInt * (100 - discountPct)) / 100));
  }

  async _awardEconomyPointsUnlocked(
    userId,
    amount,
    identity = null,
    options = {},
  ) {
    if (!this.cfg.economyEnabled) return null;
    const uid = String(userId ?? "");
    if (!uid) return null;
    let numericAmount = Number(amount ?? 0);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return null;

    if (options?.applyVipMultiplier === true) {
      const multiplier = await this.getVipEconomyMultiplier(
        uid,
        options?.source,
        identity,
      );
      numericAmount *= multiplier;
    }

    const delta = toPointsInt(numericAmount);
    if (!delta) return null;

    const current = await this._ensureEconomyBalance(uid, identity);
    const next = current + delta;
    this._economyBalances.set(uid, next);
    this._queueEconomyPersist(uid);
    incrementEconomyEarned(uid, delta).catch(() => {});
    return next;
  }

  async awardEconomyPoints(userId, amount, identity = null, options = {}) {
    return this._queueProgressOp(() =>
      this._awardEconomyPointsUnlocked(userId, amount, identity, options),
    );
  }

  async spendEconomyPoints(userId, amount, identity = null) {
    return this._queueProgressOp(async () => {
      if (!this.cfg.economyEnabled) return null;
      const uid = String(userId ?? "");
      if (!uid) return null;
      const delta = toPointsInt(amount);
      if (!delta || delta <= 0) return null;

      const current = await this._ensureEconomyBalance(uid, identity);
      if (current < delta) return null;
      const next = current - delta;
      this._economyBalances.set(uid, next);
      this._queueEconomyPersist(uid);
      incrementEconomySpent(uid, delta).catch(() => {});
      return next;
    });
  }

  async transferEconomyPoints(
    fromId,
    toId,
    amountInt,
    identityFrom,
    identityTo,
  ) {
    return this._queueProgressOp(async () => {
      if (!this.cfg.economyEnabled) return null;
      const fromUid = String(fromId ?? "");
      const toUid = String(toId ?? "");
      const delta = Math.floor(Number(amountInt) || 0);
      if (!fromUid || !toUid || !delta || delta <= 0) return null;

      const fromBal = await this._ensureEconomyBalance(fromUid, identityFrom);
      if (fromBal < delta) return null;
      const toBal = await this._ensureEconomyBalance(toUid, identityTo);

      this._economyBalances.set(fromUid, fromBal - delta);
      this._economyBalances.set(toUid, toBal + delta);
      this._queueEconomyPersist(fromUid);
      this._queueEconomyPersist(toUid);
      return {
        fromBalance: fromBal - delta,
        toBalance: toBal + delta,
      };
    });
  }

  async awardXp(userId, amount, identity = null) {
    return this._queueProgressOp(async () => {
      if (!this.cfg.xpEnabled) return null;
      const uid = String(userId ?? "");
      if (!uid) return null;
      const vipMultiplier = await this.getVipXpMultiplier(uid, identity);
      const delta = toPointsInt(Number(amount || 0) * vipMultiplier);
      if (!delta) return null;

      const state = await this._ensureXpState(uid, identity);
      let level = state.level ?? 1;
      let xp = state.xp ?? 0;
      let xpTotal = state.xpTotal ?? 0;

      xp += delta;
      xpTotal += delta;

      let leveledUp = 0;
      let rewardPoints = 0;
      while (xp >= this._getXpRequirement(level)) {
        xp -= this._getXpRequirement(level);
        level += 1;
        leveledUp += 1;
        rewardPoints += this._getXpRewardPoints(level);
        const meta = this._getXpRewardMeta(level);
        if (meta.badge) {
          await addUserReward(uid, "badge", meta.badge, level);
        }
        if (meta.achievement) {
          await addUserReward(uid, "achievement", meta.achievement, level);
        }
      }

      state.level = level;
      state.xp = xp;
      state.xpTotal = xpTotal;
      this._xpStates.set(uid, state);
      this._queueXpPersist(uid);

      if (rewardPoints > 0) {
        await this._awardEconomyPointsUnlocked(uid, rewardPoints, identity, {
          applyVipMultiplier: false,
        });
      }

      return { level, xp, xpTotal, leveledUp, rewardPoints };
    });
  }

  async getXpProfile(userId, identity = null) {
    const uid = String(userId ?? "");
    if (!uid) return null;
    const state = await this._ensureXpState(uid, identity);
    const level = state.level ?? 1;
    const xp = state.xp ?? 0;
    const xpTotal = state.xpTotal ?? 0;
    const nextReq = this._getXpRequirement(level);
    const remaining = Math.max(0, nextReq - xp);
    const rewardNext = this._getXpRewardPoints(level + 1);
    const meta = this._getXpRewardMeta(level + 1);
    return {
      level,
      xp,
      xpTotal,
      nextReq,
      remaining,
      rewardNext,
      nextBadge: meta.badge,
      nextAchievement: meta.achievement,
    };
  }

  _startEconomyOnlineTimer() {
    if (this._economyOnlineTimer) return;
    this._economyOnlineTimer = setInterval(() => {
      this._applyOnlineAccrualForAll().catch(() => {});
    }, ECONOMY_ONLINE_TICK_MS);
  }

  _stopEconomyOnlineTimer() {
    if (this._economyOnlineTimer) clearInterval(this._economyOnlineTimer);
    this._economyOnlineTimer = null;
  }

  _startPeriodicWaitlistSnapshot() {
    if (this._periodicWaitlistSnapshotTimer) return;
    this._periodicWaitlistSnapshotTimer = setInterval(() => {
      this._savePeriodicWaitlistSnapshot().catch(() => {});
    }, PERIODIC_WAITLIST_SNAPSHOT_MS);
  }

  _stopPeriodicWaitlistSnapshot() {
    if (this._periodicWaitlistSnapshotTimer) {
      clearInterval(this._periodicWaitlistSnapshotTimer);
    }
    this._periodicWaitlistSnapshotTimer = null;
  }

  async _savePeriodicWaitlistSnapshot() {
    try {
      const res = await this._api.room.getQueueStatus(this.cfg.room);
      const snapshot = parseRoomQueueSnapshot(res?.data ?? {});
      const entries = snapshot?.entries ?? [];

      if (!entries.length) {
        return; // Queue is empty, nothing to save
      }

      const rows = entries
        .filter((entry) => entry?.internalId)
        .map((entry) => ({
          userId: entry.internalId,
          publicId: entry.publicId ?? entry.id ?? null,
          username: entry.username ?? null,
          displayName: entry.displayName ?? entry.username ?? null,
          position: entry.position,
          isCurrentDj: Boolean(entry.isCurrentDj),
        }));

      await upsertWaitlistSnapshot(rows, {
        roomSlug: this.cfg.room,
        roomId: snapshot?.roomId ?? null,
        source: "periodic.waitlistSnapshot",
        markMissingLeft: true,
      });
    } catch (err) {
      this._log("warn", `[periodicWaitlistSnapshot] ${err.message}`);
    }
  }

  _trackOnlineUser(userId) {
    if (userId == null) return;
    const uid = String(userId);
    if (!uid) return;
    this._economyOnlineLast.set(uid, Date.now());
  }

  async _untrackOnlineUser(userId) {
    if (userId == null) return;
    const uid = String(userId);
    if (!uid) return;
    await this._applyOnlineAccrualForUser(uid);
    this._economyOnlineLast.delete(uid);
  }

  async _applyOnlineAccrualForUser(userId) {
    const uid = String(userId ?? "");
    if (!uid) return 0;
    if (this.isBotUser(uid)) return 0;
    if (!this.cfg.economyEnabled && !this.cfg.xpEnabled) return 0;

    const perHour = Number(this.cfg.economyOnlinePointsPerHour ?? 0);
    const xpPerHour = Number(this.cfg.xpOnlinePointsPerHour ?? 0);
    if (perHour <= 0 && xpPerHour <= 0) return 0;

    const last = this._economyOnlineLast.get(uid) ?? 0;
    if (!last) return 0;
    const now = Date.now();
    const elapsed = now - last;
    if (elapsed < 60 * 60 * 1000) return 0;

    const hours = Math.floor(elapsed / (60 * 60 * 1000));
    const newLast = last + hours * 60 * 60 * 1000;
    this._economyOnlineLast.set(uid, newLast);

    const identity = this._getUserIdentity(uid);
    if (this.cfg.economyEnabled && perHour > 0) {
      await this.awardEconomyPoints(uid, perHour * hours, identity, {
        applyVipMultiplier: true,
        source: "online",
      });
    }
    if (this.cfg.xpEnabled && xpPerHour > 0) {
      await this.awardXp(uid, xpPerHour * hours, identity);
    }
    return hours;
  }

  async _applyOnlineAccrualForAll() {
    const users = [...this._economyOnlineLast.keys()];
    for (const uid of users) {
      await this._applyOnlineAccrualForUser(uid);
    }
    return users.length;
  }

  _queueAfkPersist(userId, { lastChatAt, lastJoinAt } = {}) {
    if (userId == null) return;
    const uid = String(userId);
    if (this.isBotUser(uid)) return;
    const existing = this._afkPersistQueue.get(uid);
    const chatAt = Math.max(
      Number(existing?.lastChatAt ?? 0),
      Number(lastChatAt ?? this._lastChatAt.get(uid) ?? 0),
    );
    const joinAt = Math.max(
      Number(existing?.lastJoinAt ?? 0),
      Number(lastJoinAt ?? this._userJoinAt.get(uid) ?? 0),
    );
    if (!chatAt && !joinAt) return;

    const now = Date.now();
    const lastPersistAt = this._afkPersistLast.get(uid) ?? 0;
    const computedDue =
      lastPersistAt && now - lastPersistAt < AFK_PERSIST_THROTTLE_MS
        ? lastPersistAt + AFK_PERSIST_THROTTLE_MS
        : now;
    const dueAt = existing?.dueAt
      ? Math.min(existing.dueAt, computedDue)
      : computedDue;

    this._afkPersistQueue.set(uid, {
      lastChatAt: chatAt || null,
      lastJoinAt: joinAt || null,
      dueAt,
    });

    this._scheduleAfkPersistFlush();
  }

  _setVipStateCache(userId, state, fetchedAt = Date.now()) {
    const uid = String(userId ?? "");
    if (!uid) return;
    this._vipStates.set(uid, state);
    this._vipStateFetchedAt.set(uid, fetchedAt);
  }

  async _ensureVipState(userId, identity = null, options = {}) {
    const uid = String(userId ?? "");
    if (!uid || this.isBotUser(uid)) {
      return {
        levelRank: 0,
        levelKey: "none",
        expiresAt: 0,
        isActive: false,
      };
    }

    const force = options?.force === true;
    const now = Date.now();
    const fetchedAt = this._vipStateFetchedAt.get(uid) ?? 0;
    if (!force && fetchedAt > 0 && now - fetchedAt < VIP_STATE_CACHE_MS) {
      return (
        this._vipStates.get(uid) ?? {
          levelRank: 0,
          levelKey: "none",
          expiresAt: 0,
          isActive: false,
        }
      );
    }

    if (identity && typeof identity === "object") {
      const merged = {
        ...(this._economyIdentity.get(uid) ?? {}),
        ...identity,
      };
      this._economyIdentity.set(uid, merged);
    }

    const raw = await getVipStateStorage(uid);
    const state = resolveVipState(raw, now);
    this._setVipStateCache(uid, state, now);

    return state;
  }

  async getVipState(userId, identity = null) {
    return this._ensureVipState(userId, identity);
  }

  getVipBenefitsForLevel(levelKey) {
    return getVipBenefits(this.cfg, levelKey);
  }

  async getVipBenefits(userId, identity = null) {
    const state = await this._ensureVipState(userId, identity);
    return {
      ...state,
      ...getVipBenefits(this.cfg, state.levelKey),
    };
  }

  async getVipXpMultiplier(userId, identity = null) {
    const benefits = await this.getVipBenefits(userId, identity);
    return Math.max(1, Number(benefits.xpMultiplier ?? 1) || 1);
  }

  async getDcWindowMinutes(userId, baseWindowMin = null, identity = null) {
    const base = Math.max(
      1,
      Number(baseWindowMin ?? this.cfg.dcWindowMin ?? 10) || 10,
    );
    const benefits = await this.getVipBenefits(userId, identity);
    const mult = Math.max(1, Number(benefits.dcWindowMultiplier ?? 1) || 1);
    return Math.max(1, Math.floor(base * mult));
  }

  async getAfkLimitMinutes(userId, baseLimitMin = null, identity = null) {
    const base = Math.max(
      1,
      Number(baseLimitMin ?? this.cfg.afkLimitMin ?? 60) || 60,
    );
    const benefits = await this.getVipBenefits(userId, identity);
    const mult = Math.max(1, Number(benefits.afkLimitMultiplier ?? 1) || 1);
    return Math.max(1, Math.floor(base * mult));
  }

  getVipPlans() {
    return buildVipPlans(this.cfg);
  }

  getVipPlanByKey(planKey) {
    return findVipPlanByKey(this.cfg, planKey);
  }

  getVipPlan(levelKey, durationKey) {
    return findVipPlan(this.cfg, levelKey, durationKey);
  }

  async getVipRenewPlan(userId, identity = null) {
    const state = await this._ensureVipState(userId, identity, { force: true });
    const levelKey = state.renewLevelKey ?? state.rawLevelKey ?? null;
    const durationKey = state.renewDurationKey ?? "monthly";
    if (!levelKey) return null;
    return this.getVipPlan(levelKey, durationKey);
  }

  async setVipRenewal(userId, options = {}, identity = null) {
    const uid = String(userId ?? "");
    if (!uid || this.isBotUser(uid)) return null;

    const raw = await getVipStateStorage(uid);
    const who = {
      ...(this._economyIdentity.get(uid) ?? {}),
      ...(identity ?? {}),
    };
    this._economyIdentity.set(uid, who);

    const renewLevelKey =
      options?.levelKey == null
        ? (raw?.renewLevelKey ?? null)
        : options.levelKey;
    const renewDurationKey =
      options?.durationKey == null
        ? (raw?.renewDurationKey ?? null)
        : options.durationKey;

    await setVipRenewalSettings({
      userId: uid,
      autoRenew: options?.autoRenew,
      renewLevelKey,
      renewDurationKey,
      username: who.username ?? null,
      displayName: who.displayName ?? null,
    });

    return this._ensureVipState(uid, who, { force: true });
  }

  async getVipGreetMessage(userId, identity = null) {
    const uid = String(userId ?? "");
    if (!uid || this.isBotUser(uid)) return null;
    if (identity && typeof identity === "object") {
      this._economyIdentity.set(uid, {
        ...(this._economyIdentity.get(uid) ?? {}),
        ...identity,
      });
    }
    if (this._vipGreetMessages.has(uid)) {
      return this._vipGreetMessages.get(uid) ?? null;
    }
    const message = await getVipGreetMessage(uid);
    this._vipGreetMessages.set(uid, message ?? null);
    return message ?? null;
  }

  async setVipGreet(userId, greetMessage, identity = null) {
    const uid = String(userId ?? "");
    if (!uid || this.isBotUser(uid)) return null;
    const who = {
      ...(this._economyIdentity.get(uid) ?? {}),
      ...(identity ?? {}),
    };
    await setVipGreetMessage({
      userId: uid,
      greetMessage,
      username: who.username ?? null,
      displayName: who.displayName ?? null,
    });
    const normalized =
      greetMessage == null || String(greetMessage).trim() === ""
        ? null
        : String(greetMessage).trim();
    this._vipGreetMessages.set(uid, normalized);
    return normalized;
  }

  async getVipStealProtection(userId, identity = null) {
    const benefits = await this.getVipBenefits(userId, identity);
    return Math.max(0, Number(benefits.stealProtectionPct ?? 0) || 0);
  }

  shouldPromptVipRenew(userId, expiredAt) {
    const uid = String(userId ?? "");
    const exp = Math.max(0, Number(expiredAt) || 0);
    if (!uid || !exp) return false;

    const cooldownMs = Math.max(
      0,
      Number(this.cfg.vipRenewPromptCooldownMs ?? 0) || 0,
    );
    const key = `${uid}:${exp}`;
    const last = this._vipJoinPromptedAt.get(key) ?? 0;
    const now = Date.now();
    if (cooldownMs > 0 && last > 0 && now - last < cooldownMs) return false;
    this._vipJoinPromptedAt.set(key, now);
    return true;
  }

  async setVipState(userId, levelKey, expiresAt, identity = null) {
    const uid = String(userId ?? "");
    if (!uid || this.isBotUser(uid)) return null;
    const levelRank = vipRankFromLevel(levelKey);
    const expiration = Math.max(0, Math.floor(Number(expiresAt) || 0));
    const who = {
      ...(this._economyIdentity.get(uid) ?? {}),
      ...(identity ?? {}),
    };
    const raw = await getVipStateStorage(uid);
    await setVipStateStorage({
      userId: uid,
      level: levelRank,
      expiresAt: expiration,
      autoRenew: raw?.autoRenew ?? false,
      renewLevelKey: raw?.renewLevelKey ?? null,
      renewDurationKey: raw?.renewDurationKey ?? null,
      username: who.username ?? null,
      displayName: who.displayName ?? null,
    });

    return this._ensureVipState(uid, who, { force: true });
  }

  async purchaseVip(
    userId,
    { levelKey, durationMs, durationKey = null, autoRenew = null } = {},
    identity = null,
  ) {
    const uid = String(userId ?? "");
    if (!uid || this.isBotUser(uid)) {
      return { ok: false, code: "invalid_user" };
    }

    const levelRank = vipRankFromLevel(levelKey);
    const deltaMs = Math.max(0, Math.floor(Number(durationMs) || 0));
    if (levelRank <= 0 || deltaMs <= 0) {
      return { ok: false, code: "invalid_purchase" };
    }

    const who = {
      ...(this._economyIdentity.get(uid) ?? {}),
      ...(identity ?? {}),
    };
    this._economyIdentity.set(uid, who);

    const current = (await getVipStateStorage(uid)) ?? {};
    const nextAutoRenew =
      autoRenew == null ? (current.autoRenew ?? false) : autoRenew;
    const nextDurationKey =
      durationKey ?? current.renewDurationKey ?? "monthly";

    const result = await this._queueProgressOp(() =>
      applyVipPurchase({
        userId: uid,
        level: levelRank,
        durationMs: deltaMs,
        autoRenew: nextAutoRenew,
        renewLevelKey: levelKey,
        renewDurationKey: nextDurationKey,
        username: who.username ?? null,
        displayName: who.displayName ?? null,
      }),
    );

    if (!result?.ok) return result;

    const state = await this._ensureVipState(uid, who, { force: true });
    return {
      ...result,
      levelKey: vipLevelFromRank(result.level),
      renewLevelKey: state.renewLevelKey,
      renewDurationKey: state.renewDurationKey,
      autoRenew: state.autoRenew,
    };
  }

  async grantVip(
    userId,
    { levelKey, durationMs, durationKey = null, autoRenew = null } = {},
    identity = null,
  ) {
    return this.purchaseVip(
      userId,
      { levelKey, durationMs, durationKey, autoRenew },
      identity,
    );
  }

  async renewVip(userId, identity = null, options = {}) {
    const uid = String(userId ?? "");
    if (!uid || this.isBotUser(uid)) {
      return { ok: false, code: "invalid_user" };
    }

    const plan = options?.planKey
      ? this.getVipPlanByKey(options.planKey)
      : await this.getVipRenewPlan(uid, identity);
    if (!plan) {
      return { ok: false, code: "no_plan" };
    }

    const who = {
      ...(this._economyIdentity.get(uid) ?? {}),
      ...(identity ?? {}),
    };
    const priceInt = toPointsInt(plan.price);
    const balance = await this.getEconomyBalance(uid, who);
    if (balance < priceInt) {
      return {
        ok: false,
        code: "insufficient",
        balance,
        priceInt,
        plan,
      };
    }

    const spent = await this.spendEconomyPoints(
      uid,
      priceInt / POINT_SCALE,
      who,
    );
    if (spent == null) {
      return {
        ok: false,
        code: "insufficient",
        balance,
        priceInt,
        plan,
      };
    }

    const result = await this.purchaseVip(
      uid,
      {
        levelKey: plan.vipLevel,
        durationMs: plan.vipDurationMs,
        durationKey: plan.vipDuration,
        autoRenew: options?.autoRenew,
      },
      who,
    );

    if (!result?.ok) {
      await this.awardEconomyPoints(uid, priceInt / POINT_SCALE, who, {
        applyVipMultiplier: false,
      });
      return { ...result, plan, priceInt };
    }

    return {
      ...result,
      plan,
      priceInt,
    };
  }

  async checkVipJoinFlow(userId, identity = null) {
    const uid = String(userId ?? "");
    if (!this.cfg.vipEnabled || !this.cfg.vipJoinCheckEnabled) {
      return { action: "disabled" };
    }
    if (!uid || this.isBotUser(uid)) return { action: "invalid_user" };

    const state = await this._ensureVipState(uid, identity, { force: true });
    if (state.isActive || !state.isExpired) {
      return { action: "none", state };
    }

    const plan = await this.getVipRenewPlan(uid, identity);
    if (!plan) {
      return { action: "expired_no_plan", state };
    }

    const who = {
      ...(this._economyIdentity.get(uid) ?? {}),
      ...(identity ?? {}),
    };
    const balance = await this.getEconomyBalance(uid, who);
    const priceInt = toPointsInt(plan.price);

    if (state.autoRenew && balance >= priceInt) {
      const renewed = await this.renewVip(uid, who, {
        planKey: plan.key,
        autoRenew: true,
      });
      if (renewed?.ok) {
        return {
          action: "auto_renewed",
          state,
          plan,
          result: renewed,
        };
      }
    }

    if (
      balance >= priceInt &&
      this.shouldPromptVipRenew(uid, state.expiredAt)
    ) {
      return {
        action: "prompt_renew",
        state,
        plan,
        balance,
        priceInt,
        levelLabel: getVipLevelLabel(plan.vipLevel, this._locale),
        durationLabel: getVipDurationLabel(plan.vipDuration, this._locale),
      };
    }

    return {
      action: "expired",
      state,
      plan,
      balance,
      priceInt,
    };
  }

  _scheduleAfkPersistFlush() {
    if (this._afkPersistQueue.size === 0) {
      if (this._afkPersistTimer) clearTimeout(this._afkPersistTimer);
      this._afkPersistTimer = null;
      this._afkPersistTimerAt = 0;
      return;
    }

    let nextAt = Infinity;
    for (const entry of this._afkPersistQueue.values()) {
      if (entry?.dueAt != null && entry.dueAt < nextAt) {
        nextAt = entry.dueAt;
      }
    }
    if (!Number.isFinite(nextAt)) return;

    if (this._afkPersistTimer && this._afkPersistTimerAt <= nextAt) return;

    if (this._afkPersistTimer) clearTimeout(this._afkPersistTimer);
    const delay = Math.max(0, nextAt - Date.now());
    this._afkPersistTimerAt = nextAt;
    this._afkPersistTimer = setTimeout(() => {
      this._flushAfkPersist().catch(() => {});
    }, delay);
  }

  async _flushAfkPersist(force = false) {
    if (this._afkPersistQueue.size === 0) return 0;

    const now = Date.now();
    const entries = [];
    for (const [uid, entry] of this._afkPersistQueue.entries()) {
      if (!force && entry?.dueAt != null && entry.dueAt > now) continue;
      entries.push({
        userId: uid,
        lastChatAt: entry?.lastChatAt ?? null,
        lastJoinAt: entry?.lastJoinAt ?? null,
      });
      this._afkPersistQueue.delete(uid);
    }

    if (entries.length === 0) {
      this._scheduleAfkPersistFlush();
      return 0;
    }

    try {
      await upsertAfkStateBatch(entries);
      for (const entry of entries) {
        this._afkPersistLast.set(String(entry.userId), now);
      }
    } catch {
      const retryAt = now + AFK_PERSIST_RETRY_MS;
      for (const entry of entries) {
        this._afkPersistQueue.set(String(entry.userId), {
          lastChatAt: entry.lastChatAt ?? null,
          lastJoinAt: entry.lastJoinAt ?? null,
          dueAt: retryAt,
        });
      }
    }

    this._scheduleAfkPersistFlush();
    return entries.length;
  }

  /** Count of users active within the given window (ms). */
  getActiveUserCount(windowMs) {
    const now = Date.now();
    const window = Math.max(0, Number(windowMs) || 0);
    let count = 0;
    for (const uid of this._roomUsers.keys()) {
      const last = this._lastChatAt.get(uid);
      if (last != null && now - last <= window) count++;
    }
    return count;
  }

  /** Best-effort display name for a room user. */
  getRoomUserDisplayName(userId) {
    if (userId == null) return null;
    const uid = String(userId);
    const u = this._roomUsers.get(uid);
    return u?.displayName ?? u?.username ?? this._roomUsersMap[uid] ?? null;
  }

  getRoomUserPublicId(userId) {
    if (userId == null) return null;
    const uid = String(userId);
    const u = this._roomUsers.get(uid);
    return u?.publicId ?? null;
  }

  /** Numeric privilege level of the bot's own room role. */
  getBotRoleLevel() {
    return getRoleLevel(this._botRole);
  }

  /** True if the provided userId is the bot itself. */
  isBotUser(userId) {
    if (userId == null) return false;
    const uid = String(userId);
    if (uid.startsWith("room-bot:")) return true;
    return uid === String(this._userId);
  }

  /**
   * Numeric privilege level of a room user by their userId.
   * Takes the highest of: room role level OR any platform role level.
   * This ensures global roles (developer, admin, ambassador) always bypass
   * room-scoped role checks.
   * @param {string|number} userId
   */
  getUserRoleLevel(userId) {
    if (userId == null) return 0;
    const u = this._roomUsers.get(String(userId));
    const roomLevel = getRoleLevel(u?.role);
    const platformRoles = u?.platformRoles?.length
      ? u.platformRoles
      : u?.platformRole
        ? [u.platformRole]
        : [];
    const platformLevel = getPlatformRoleLevel(platformRoles);
    return Math.max(roomLevel, platformLevel);
  }

  /**
   * True when a user has any privileged platform role.
   * These users are protected from bot moderation actions.
   * @param {string|number} userId
   */
  hasPlatformRole(userId) {
    if (userId == null) return false;
    const u = this._roomUsers.get(String(userId));
    const platformRoles = u?.platformRoles?.length
      ? u.platformRoles
      : u?.platformRole
        ? [u.platformRole]
        : [];
    return getPlatformRoleLevel(platformRoles) > 0;
  }

  _matchEntry(u) {
    if (u == null) return false;
    if (typeof u === "number" || typeof u === "string") {
      return String(u) === String(this._userId);
    }
    const id = u.userId ?? u.user_id ?? u.id;
    if (id != null && String(id) === String(this._userId)) return true;
    return (
      this._username != null &&
      (u.username ?? "").toLowerCase() === this._username.toLowerCase()
    );
  }

  _resolveName(u) {
    if (u == null) return null;
    if (typeof u === "number" || typeof u === "string") {
      return this._roomUsersMap[String(u)] ?? null;
    }
    return u.displayName ?? u.display_name ?? u.username ?? null;
  }

  /**
   * Build the command execution context.
   * Passed as `ctx` to every command's execute() function.
   */
  _buildCtx({ sender, args, rawArgs, message, messageId }) {
    const senderRoleLevel = this.getUserRoleLevel(sender.userId);
    const senderRole =
      this._roomUsers.get(String(sender.userId ?? ""))?.role ?? "user";
    return {
      bot: this,
      api: this._apiCalls,
      apiCalls: this._apiCalls,
      args,
      rawArgs,
      message,
      messageId,
      sender,
      /** Role string of the message sender in this room */
      senderRole,
      /** Numeric privilege level of the sender (see lib/permissions.js) */
      senderRoleLevel,
      /** Role string of the bot itself in this room */
      botRole: this._botRole ?? "user",
      /** Numeric privilege level of the bot */
      botRoleLevel: this.getBotRoleLevel(),
      room: this.cfg.room,
      roomId: this._roomId,
      locale: this._locale,
      t: (key, vars) => this.t(key, vars),
      tArray: (key) => this.tArray(key),
      mention: (name) => ensureMention(name),
      mentionUser: (user, fallback = "") =>
        ensureMention(user?.displayName ?? user?.username ?? fallback),
      /** Reply to the triggering message (preferred). */
      reply: (text) => this.sendReply(text, messageId),
      /** Send a plain chat message without threading. */
      send: (text) => this.sendChat(text),
      /** Reply to an arbitrary messageId. */
      replyTo: (targetMessageId, text) => this.sendReply(text, targetMessageId),
    };
  }

  /**
   * Build the event dispatch context.
   * Passed as `ctx` to every event handler's handle() function.
   */
  _buildEventCtx() {
    return {
      bot: this,
      api: this._apiCalls,
      room: this.cfg.room,
      roomId: this._roomId,
      locale: this._locale,
      t: (key, vars) => this.t(key, vars),
      tArray: (key) => this.tArray(key),
      reply: (text) => this.sendChat(text),
      send: (text) => this.sendChat(text),
    };
  }

  setLogSink(handler) {
    this._logSink = typeof handler === "function" ? handler : null;
  }

  _log(level, msg) {
    const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
    const prefix = `[${ts}] [${level.toUpperCase().padEnd(4)}]`;
    if (level === "error") console.error(prefix, msg);
    else if (level === "warn") console.warn(prefix, msg);
    else console.log(prefix, msg);
    if (this._logSink) {
      try {
        this._logSink({
          level,
          source: "bot",
          message: String(msg ?? ""),
          timestamp: ts,
        });
      } catch {
        // Ignore dashboard log sink errors
      }
    }
  }

  // ── State snapshot (used by !stats, !queue, etc.) ─────────────────────────

  getSessionState() {
    const now = Date.now();
    const uptimeSec = this._startedAt
      ? Math.floor((now - this._startedAt) / 1000)
      : 0;
    return {
      username: this._username,
      displayName: this._displayName,
      roomSlug: this.cfg.room,
      roomName: this._roomName,
      currentTrack: this._currentTrack,
      djName: this._djName,
      inWaitlist: this._waitlistPosition != null,
      waitlistPosition: this._waitlistPosition,
      waitlistTotal: this._waitlistTotal,
      nextDjName: this._nextDjName,
      wootCount: this._wootCount,
      /** Reactions for the current track only (reset on each DJ advance) */
      currentTrackReactions: { ...this._currentReactions },
      uptimeSec,
      startedAt: this._startedAt,
    };
  }

  getDashboardState() {
    return {
      ...this.getSessionState(),
      paused: this._paused,
      botRole: this._botRole ?? "user",
      roomUserCount: this._roomUsers.size,
      songCount: this._songCount,
      reactionsTotal: { ...this._reactions },
      currentTrackElapsedSec: this.getCurrentTrackElapsedSec(),
      commandsLoaded: this.commands?.all?.length ?? 0,
      eventsLoaded: this.events?.count ?? 0,
    };
  }
}
