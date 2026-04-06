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

import { createApiClient, createRoomBotRealtimeClient } from "@wavezfm/api";
import { WavezEvents as Events } from "./wavez-events.js";
import { CommandRegistry } from "../commands/index.js";
import { EventRegistry } from "../events/index.js";
import { loadConfig } from "./config.js";
import { getRoleLevel } from "./permissions.js";
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
  addUserReward,
  addTrackHistory,
  incrementUserDjPlay,
  incrementUserWoot,
  incrementSongPlay,
  incrementSongWoot,
  getLeaderboardResetAt,
  setLeaderboardResetAt,
  resetLeaderboards,
  listAfkState,
  upsertAfkStateBatch,
} from "./storage.js";
import { BOT_VERSION } from "./version.js";
import { createApiCalls } from "./api/index.js";
import { resetRouletteState } from "../helpers/roulette.js";
import { toPointsInt } from "../helpers/points.js";
import {
  normalizeLocale,
  resolveLocalizedValue,
  t as translate,
  tArray as translateArray,
} from "./i18n.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Delay after booth:advance before casting the auto-woot vote */
const WOOT_DELAY_MS = 800;

/** Extra grace after track end before auto-skip triggers */
const AUTO_SKIP_GRACE_MS = 10_000;

/** Throttle AFK persistence to reduce DB writes */
const AFK_PERSIST_THROTTLE_MS = 15_000;
const AFK_PERSIST_RETRY_MS = 5_000;

/** Throttle economy/xp persistence to reduce DB writes */
const ECONOMY_PERSIST_THROTTLE_MS = 10_000;
const ECONOMY_PERSIST_RETRY_MS = 10_000;

/** Online points accrue in full-hour blocks, checked on a timer */
const ECONOMY_ONLINE_TICK_MS = 5 * 60_000;

/** Throttle leaderboard reset checks */
const LEADERBOARD_RESET_CHECK_THROTTLE_MS = 60_000;

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
     * @type {Map<string, {userId:string, username:string, displayName:string, role:string}>}
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

    // ── Leaderboard tracking ─────────────────────────────────────────────
    this._leaderboardVoteTrack = new Map();
    this._leaderboardResetInFlight = false;
    this._leaderboardResetLastCheck = 0;

    // ── Auto-skip timer ───────────────────────────────────────────────────
    this._autoSkipTimer = null;
    this._autoSkipTrackKey = null;

    // ── Pipeline client ──────────────────────────────────────────────────────
    this._pipeline = null;
    this._paused = false;

    // ── Registries ───────────────────────────────────────────────────────────
    this.commands = new CommandRegistry();
    this.events = new EventRegistry();
    this._modulesLoaded = false;

    // ── Dashboard log hook ──────────────────────────────────────────────────
    this._logSink = null;

    // ── Chat message cache (for nuke / delmsg / duel fallback) ───────────────
    /** @type {Map<string, string[]>} userId → recent messageIds (capped) */
    this._chatMessages = new Map();
    /** @type {Map<string, number>} userId → auto-delete expiresAt (simulated mute) */
    this._autoDeleteUsers = new Map();
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
    resetRouletteState();
    if (this._voteSkipState?.timeoutId) {
      clearTimeout(this._voteSkipState.timeoutId);
    }
    this._voteSkipState = null;
    this._clearAutoSkipTimer();
    await this._flushAfkPersist(true);
    await this._flushEconomyPersist(true);
    this._stopEconomyOnlineTimer();
    this._economyOnlineLast.clear();
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
      logging: false,
    });

    // ── Connection lifecycle ────────────────────────────────────────────────

    this._pipeline.on(Events.WS_OPEN, () => {
      this._log(
        "info",
        this.t("logs.bot.pipelineReady", {
          session: null,
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
      this._log(
        "info",
        this.t("logs.bot.disconnected", {
          code: payload?.event?.code ?? "",
          reason: payload?.event?.reason ? ` - ${payload.event.reason}` : "",
        }),
      );
    });

    this._pipeline.on(Events.WS_ERROR, (packet) => {
      this._log(
        "warn",
        this.t("logs.bot.pipelineError", {
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
          this.t("logs.bot.pipelineError", {
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

    this._pipeline.connect().catch((err) => {
      this._log(
        "warn",
        this.t("logs.bot.pipelineError", { error: err.message }),
      );
    });
  }

  // ── Room bootstrap ─────────────────────────────────────────────────────────

  async _joinRoom() {
    // The realtime client already sent join_room via autoJoinRoom=true.
    // We use roomBot.getState to seed the local room snapshot.
    try {
      const stateRes = await this._api.roomBot.getState(this._roomId);
      const snapshot = stateRes?.data?.snapshot ?? {};
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
            username: u.username ?? null,
            displayName,
            role: u.role ?? "user",
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
        this._waitlistTotal = wl.length;
        const myIdx = wl.findIndex((u) => this._matchEntry(u));
        this._waitlistPosition = myIdx >= 0 ? myIdx + 1 : null;
        this._nextDjName = wl.length > 0 ? this._resolveName(wl[0]) : null;
      }
    } catch (err) {
      this._log("warn", this.t("logs.bot.joinFailed", { error: err.message }));
    }

    this._log(
      "info",
      this.t("logs.bot.joinedRoom", { room: this._roomName ?? this.cfg.room }),
    );

    this._startEconomyOnlineTimer();

    try {
      const name = this._displayName ?? this._username ?? "Bot";
      await this.sendChat(
        this.t("logs.bot.onlineAnnouncement", {
          name,
          version: BOT_VERSION,
        }),
      );
    } catch (err) {
      this._log(
        "warn",
        this.t("logs.bot.onlineAnnounceFailed", { error: err.message }),
      );
    }

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
    const media =
      data?.media ?? data?.currentMedia ?? data?.current_media ?? {};
    const dj = data?.dj ?? data?.currentDj ?? data?.current_dj ?? {};

    this._djId = dj.userId ?? dj.user_id ?? dj.id ?? null;
    this._djName = dj.displayName ?? dj.display_name ?? dj.username ?? null;
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

    this._recordTrackHistory(prevTrack, prevDjId, prevDjName).catch(() => {});
    this._recordDjPlay(dj).catch(() => {});
    this._recordSongPlay(this._currentTrack).catch(() => {});

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

    if (!this._paused) {
      this.events
        .dispatch(Events.ROOM_WAITLIST_LEAVE, this._buildEventCtx(), data)
        .catch(() => {});
    }
  }

  _onWaitlistUpdate(data) {
    const wl = data?.waitlist ?? data?.queue ?? [];
    if (Array.isArray(wl)) {
      this._waitlistTotal = wl.length;
      const myIdx = wl.findIndex((u) => this._matchEntry(u));
      this._waitlistPosition = myIdx >= 0 ? myIdx + 1 : null;
      this._nextDjName = wl.length > 0 ? this._resolveName(wl[0]) : null;
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
      username: data?.username ?? null,
      displayName,
      role: data?.role ?? "user",
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
      this._roomUsers.delete(uid);
      this._userJoinAt.delete(uid);
      this._untrackOnlineUser(uid).catch(() => {});
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
      const args = rawArgs ? rawArgs.split(/\s+/) : [];

      if (name) {
        if (this._paused && !PAUSED_COMMAND_ALLOWLIST.has(name)) return;
        const ctx = this._buildCtx({
          sender,
          args,
          rawArgs,
          message: content,
          messageId,
        });
        const cmdDef = this.commands.resolve(name);
        if (cmdDef && this.cfg.deleteCommandMessagesEnabled) {
          const delayMs = Number(this.cfg.deleteCommandMessagesDelayMs ?? 0);
          this.scheduleMessageDelete(messageId, delayMs);
        }
        this.commands.dispatch(ctx, name).catch((err) =>
          this._log(
            "warn",
            this.t("logs.bot.commandError", {
              command: name,
              error: err.message,
            }),
          ),
        );
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
    // NOTE: The @wavezfm/api room-bot REST resource does not yet expose a
    // direct vote endpoint. Auto-woot via WebSocket commands is TODO.
    // For now, voting is a no-op. Set autoWoot: false in config.json to
    // suppress this warning.
    this._log(
      "warn",
      this.t("logs.bot.voteFailed", {
        error: "vote not yet supported in @wavezfm/api",
      }),
    );
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
              username: u.username ?? null,
              displayName,
              role: u.role ?? "user",
            });
          }
          if (!this._userJoinAt.has(uidStr)) {
            this._userJoinAt.set(uidStr, Date.now());
          }
        }
      }

      const wl = snapshot.waitlist ?? snapshot.queue ?? [];
      if (Array.isArray(wl)) {
        this._waitlistTotal = wl.length;
        const myIdx = wl.findIndex((u) => this._matchEntry(u));
        this._waitlistPosition = myIdx >= 0 ? myIdx + 1 : null;
        this._nextDjName = wl.length > 0 ? this._resolveName(wl[0]) : null;
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
  async safeSkip({ message, onErrorKey } = {}) {
    if (!this._api?.roomBot?.updateSettings) return false;

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
      if (message) await this.sendChat(message);
      await this._api.roomBot.updateSettings(this._roomId, {
        commandAnnouncement: { commandId: "skip" },
      });
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

    if (this.cfg.motdEnabled) {
      const interval = Number(this.cfg.motdInterval) || 0;
      if (interval <= 0 || this._songCount % interval !== 0) return;
      const msg = String(this.localizeValue(this.cfg.motd) ?? "").trim();
      if (msg) await this.sendChat(msg);
      return;
    }

    const interval = Number(this.cfg.messageInterval) || 0;
    const list = Array.isArray(this.cfg.intervalMessages)
      ? this.cfg.intervalMessages
      : [];
    if (interval <= 0 || list.length === 0) return;
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
    const lower = target.toLowerCase().replace(/^@/, "");
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

  /** Record the join time for a user if not already set. */
  setUserJoinAt(userId, at = Date.now()) {
    if (userId == null) return;
    const uid = String(userId);
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
      const row = await getEconomyBalance(uid).catch(() => null);
      const balance = Number(row?.balance ?? 0) || 0;
      this._economyBalances.set(uid, balance);
      if (row?.username || row?.display_name || row?.displayName) {
        this._economyIdentity.set(uid, {
          username: row?.username ?? null,
          displayName: row?.display_name ?? row?.displayName ?? null,
        });
      }
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
        xpTotal: Number(row?.xp_total ?? row?.xpTotal ?? 0) || 0,
      };
      this._xpStates.set(uid, state);
      if (row?.username || row?.display_name || row?.displayName) {
        this._economyIdentity.set(uid, {
          username: row?.username ?? null,
          displayName: row?.display_name ?? row?.displayName ?? null,
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

  async _awardEconomyPointsUnlocked(userId, amount, identity = null) {
    if (!this.cfg.economyEnabled) return null;
    const uid = String(userId ?? "");
    if (!uid) return null;
    const delta = toPointsInt(amount);
    if (!delta) return null;

    const current = await this._ensureEconomyBalance(uid, identity);
    const next = current + delta;
    this._economyBalances.set(uid, next);
    this._queueEconomyPersist(uid);
    return next;
  }

  async awardEconomyPoints(userId, amount, identity = null) {
    return this._queueProgressOp(() =>
      this._awardEconomyPointsUnlocked(userId, amount, identity),
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
      const delta = toPointsInt(amount);
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
        await this._awardEconomyPointsUnlocked(uid, rewardPoints, identity);
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
      await this.awardEconomyPoints(uid, perHour * hours, identity);
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

  /** Numeric privilege level of the bot's own room role. */
  getBotRoleLevel() {
    return getRoleLevel(this._botRole);
  }

  /** True if the provided userId is the bot itself. */
  isBotUser(userId) {
    if (userId == null) return false;
    return String(userId) === String(this._userId);
  }

  /**
   * Numeric privilege level of a room user by their userId.
   * @param {string|number} userId
   */
  getUserRoleLevel(userId) {
    if (userId == null) return 0;
    const u = this._roomUsers.get(String(userId));
    return getRoleLevel(u?.role);
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
      reply: (text) => this.sendChat(text),
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
