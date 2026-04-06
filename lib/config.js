/**
 * lib/config.js
 *
 * Configuration is split into two files at the chatbot root:
 *
 *   .env          — secrets only: BOT_EMAIL, BOT_PASSWORD
 *   config.json   — everything else: room slug, feature flags, messages, etc.
 *
 * On first run, if config.json is missing it is automatically copied from
 * config.example.json so the bot can start with sensible defaults.
 *
 * Call loadConfig() once at startup (called by WavezBot constructor).
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { normalizeLocale, t as translate } from "./i18n.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// ── .env — secrets ────────────────────────────────────────────────────────────

const envPath = path.join(ROOT, ".env");

if (!fs.existsSync(envPath)) {
  console.error(
    translate("config.envMissing", {
      path: envPath,
    }),
  );
  process.exit(1);
}

const require = createRequire(import.meta.url);
const dotenv = require("dotenv");
dotenv.config({ path: envPath });

// ── config.json — non-critical settings ──────────────────────────────────────

const configPath = path.join(ROOT, "config.json");
const examplePath = path.join(ROOT, "config.example.json");

if (!fs.existsSync(configPath)) {
  if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, configPath);
    console.warn(translate("config.configCopied"));
  } else {
    console.error(
      translate("config.configMissing", {
        path: configPath,
      }),
    );
    process.exit(1);
  }
}

let _json;
try {
  _json = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch (err) {
  console.error(
    translate("config.parseFailed", {
      error: err.message,
    }),
  );
  process.exit(1);
}

const configLocale = normalizeLocale(_json?.locale);

export function loadConfig() {
  // ── env helpers ─────────────────────────────────────────────────────────
  const requiredEnv = (key) => {
    const v = process.env[key];
    if (!v) {
      console.error(
        translate(
          "config.missingEnvVar",
          {
            key,
          },
          configLocale,
        ),
      );
      process.exit(1);
    }
    return v;
  };

  // ── json helpers ────────────────────────────────────────────────────────
  const j = (key, fallback) => _json[key] ?? fallback;
  const jBool = (key, fallback) => Boolean(j(key, fallback));
  const jInt = (key, fallback) => {
    const v = Number(j(key, fallback));
    return Number.isFinite(v) ? v : fallback;
  };
  const jNum = (key, fallback) => {
    const v = Number(j(key, fallback));
    return Number.isFinite(v) ? v : fallback;
  };
  const jObj = (key, fallback) => {
    const v = j(key, fallback);
    return v && typeof v === "object" && !Array.isArray(v) ? v : fallback;
  };
  const jStr = (key, fallback) => String(j(key, fallback) ?? "");
  const jArr = (key, fallback) => {
    const v = j(key, fallback);
    return Array.isArray(v) ? v : fallback;
  };

  const normalizeReset = (value, fallback) => {
    const raw = String(value ?? fallback ?? "")
      .trim()
      .toLowerCase();
    if (["daily", "weekly", "monthly", "never"].includes(raw)) return raw;
    return "never";
  };

  const optionalEnv = (key) => process.env[key] ?? null;

  // ── required json fields ─────────────────────────────────────────────────
  const room = jStr("room", "");
  if (!room || room === "room-slug") {
    console.error(translate("config.invalidRoom", null, configLocale));
    process.exit(1);
  }

  const roomUrlTemplate = jStr("roomUrl", "");
  const roomUrl = roomUrlTemplate
    ? roomUrlTemplate.replace(/\{room\}/g, room)
    : "";
  const autowootUrl = jStr("autowootUrl", "");
  const dashboardTheme = jObj("dashboardTheme", {});

  // ── auth mode: pre-generated bot token OR email+password ─────────────────
  // If BOT_TOKEN is set, the bot uses it directly and skips the login flow.
  // BOT_EMAIL + BOT_PASSWORD are only required when BOT_TOKEN is absent.
  const botToken = optionalEnv("BOT_TOKEN");
  let email = null;
  let password = null;
  if (!botToken) {
    email = requiredEnv("BOT_EMAIL");
    password = requiredEnv("BOT_PASSWORD");
  }

  return {
    // ── Secrets (from .env) ─────────────────────────────────────────────────
    botToken,
    email,
    password,

    // ── Network (from config.json) ──────────────────────────────────────────
    room,
    roomUrl,
    autowootUrl,
    dashboardTheme,
    locale: jStr("locale", "pt-BR"),
    apiUrl: jStr("apiUrl", "https://wavez.fm/api"),

    // ── Command system ───────────────────────────────────────────────────────
    cmdPrefix: jStr("cmdPrefix", "!"),
    deleteCommandMessagesEnabled: jBool("deleteCommandMessagesEnabled", false),
    deleteCommandMessagesDelayMs: jInt("deleteCommandMessagesDelayMs", 0),

    // ── Auto-woot ────────────────────────────────────────────────────────────
    autoWoot: jBool("autoWoot", true),

    // ── Bot-mention reply ─────────────────────────────────────────────────────
    botMessage: j(
      "botMessage",
      "Oi! Sou um bot e não consigo conversar. 🤖 Use !help para ver o que posso fazer!",
    ),
    botMentionCooldownMs: jInt("botMentionCooldownMs", 30_000),

    // ── Chat keyword auto-reply ─────────────────────────────────────────────
    chatKeywordReplyEnabled: jBool("chatKeywordReplyEnabled", false),
    chatKeywordReplyCooldownMs: jInt("chatKeywordReplyCooldownMs", 3_000),
    chatKeywordReplySameReplyCooldownMs: jInt(
      "chatKeywordReplySameReplyCooldownMs",
      86_400_000,
    ),
    chatKeywordReplyRules: jArr("chatKeywordReplyRules", []),

    // ── Greet event ───────────────────────────────────────────────────────────
    greetEnabled: jBool("greetEnabled", true),
    greetMessage: j("greetMessage", "🎵 Bem-vindo(a) à sala, @{name}!"),
    greetBackMessage: j(
      "greetBackMessage",
      "🎵 Bem-vindo(a) de volta, @{name}!",
    ),
    greetMessages: jArr("greetMessages", []),
    greetBackMessages: jArr("greetBackMessages", []),
    greetDeleteMs: jInt("greetDeleteMs", 0),
    greetCooldownMs: jInt("greetCooldownMs", 3_600_000),

    // ── Lock chat ──────────────────────────────────────────────────
    lockChatEnabled: jBool("lockChatEnabled", false),
    lockChatMinRole: jStr("lockChatMinRole", "resident_dj"),

    // ── MOTD / interval messages ─────────────────────────────────────────
    motdEnabled: jBool("motdEnabled", false),
    motdInterval: jInt("motdInterval", 5),
    motd: j("motd", "Mensagem do dia"),
    intervalMessages: jArr("intervalMessages", []),
    messageInterval: jInt("messageInterval", 5),

    // ── DC restore ─────────────────────────────────────────────────────
    dcWindowMin: jInt("dcWindowMin", 10),

    // ── Track blacklist ─────────────────────────────────────────────────
    blacklistEnabled: jBool("blacklistEnabled", true),

    // ── Time guard ─────────────────────────────────────────────────────
    timeGuardEnabled: jBool("timeGuardEnabled", false),
    maxSongLengthMin: jInt("maxSongLengthMin", 10),

    // ── Auto-skip (stalled track) ──────────────────────────────────────
    autoSkipEnabled: jBool("autoSkipEnabled", false),

    // ── AFK removal ────────────────────────────────────────────────────
    afkRemovalEnabled: jBool("afkRemovalEnabled", false),
    afkLimitMin: jInt("afkLimitMin", 60),

    // ── Duel mute ───────────────────────────────────────────────────────
    duelMuteMin: jInt("duelMuteMin", 5),

    // ── Economy ────────────────────────────────────────────────────────
    economyEnabled: jBool("economyEnabled", true),
    economyChatPoints: jNum("economyChatPoints", 0.5),
    economyChatCooldownMs: jInt("economyChatCooldownMs", 30_000),
    economyDjPoints: jNum("economyDjPoints", 5),
    economyWootPoints: jNum("economyWootPoints", 0.5),
    economyGrabPoints: jNum("economyGrabPoints", 1),
    economyOnlinePointsPerHour: jNum("economyOnlinePointsPerHour", 1),
    economyTransferMin: jNum("economyTransferMin", 1),

    // ── XP ─────────────────────────────────────────────────────────────
    xpEnabled: jBool("xpEnabled", true),
    xpChatPoints: jNum("xpChatPoints", 0.5),
    xpChatCooldownMs: jInt("xpChatCooldownMs", 30_000),
    xpDjPoints: jNum("xpDjPoints", 5),
    xpWootPoints: jNum("xpWootPoints", 0.5),
    xpGrabPoints: jNum("xpGrabPoints", 1),
    xpOnlinePointsPerHour: jNum("xpOnlinePointsPerHour", 1),
    xpBase: jNum("xpBase", 50),
    xpExponent: jNum("xpExponent", 1.3),
    xpRewardBasePoints: jNum("xpRewardBasePoints", 2),
    xpRewardStepPoints: jNum("xpRewardStepPoints", 1),
    xpBadgeRewards: jObj("xpBadgeRewards", {}),
    xpAchievementRewards: jObj("xpAchievementRewards", {}),

    // ── Leaderboards / memes ─────────────────────────────────────────
    leaderboardReset: normalizeReset(j("leaderboardReset", "weekly")),
    memeSubreddits: jArr("memeSubreddits", ["memes", "wholesomememes", "funny"])
      .map((name) => String(name ?? "").trim())
      .filter((name) => name),

    // ── Casino / betting ─────────────────────────────────────────────
    casinoEnabled: jBool("casinoEnabled", true),
    casinoMinBet: jNum("casinoMinBet", 1),
    casinoMaxBet: jNum("casinoMaxBet", 100),
    casinoCooldownMs: jInt("casinoCooldownMs", 5000),
    casinoBetMultiplierFactor: jNum("casinoBetMultiplierFactor", 0.01),
    casinoMultiplierMax: jNum("casinoMultiplierMax", 6),
    casinoSlotsSymbols: jArr("casinoSlotsSymbols", []),
    casinoSlotsPairMultiplier: jNum("casinoSlotsPairMultiplier", 1.2),
    casinoJackpotEnabled: jBool("casinoJackpotEnabled", true),
    casinoJackpotLossShare: jNum("casinoJackpotLossShare", 0.1),
    casinoJackpotSymbol: jStr("casinoJackpotSymbol", "💎"),
    casinoRouletteBetMultiplierFactor: jNum(
      "casinoRouletteBetMultiplierFactor",
      0,
    ),
    casinoRouletteRedMultiplier: jNum("casinoRouletteRedMultiplier", 2),
    casinoRouletteBlackMultiplier: jNum("casinoRouletteBlackMultiplier", 2),
    casinoRouletteGreenMultiplier: jNum("casinoRouletteGreenMultiplier", 14),
    casinoDiceSides: jInt("casinoDiceSides", 6),
    casinoDiceWinMultiplier: jNum("casinoDiceWinMultiplier", 6),

    // ── Daily reward ───────────────────────────────────────────────
    dailyRewardAmount: jNum("dailyRewardAmount", 5),
    dailyRewardCooldownMs: jInt("dailyRewardCooldownMs", 86_400_000),

    // ── Shop ───────────────────────────────────────────────────────
    shopItems: jArr("shopItems", []),

    // ── Work ───────────────────────────────────────────────────────
    workJobs: jArr("workJobs", []),
    workCooldownMs: jInt("workCooldownMs", 86_400_000),

    // ── Steal ──────────────────────────────────────────────────────
    stealEnabled: jBool("stealEnabled", true),
    stealMinAmount: jNum("stealMinAmount", 0.5),
    stealMaxAmount: jNum("stealMaxAmount", 2),
    stealFailChance: jNum("stealFailChance", 0.3),
    stealBailAmount: jNum("stealBailAmount", 3),
    stealMuteMinutes: jInt("stealMuteMinutes", 10),

    // ── Vote skip ───────────────────────────────────────────────────
    voteSkipEnabled: jBool("voteSkipEnabled", true),
    voteSkipThreshold: jNum("voteSkipThreshold", 0.3),
    voteSkipDurationMs: jInt("voteSkipDurationMs", 60_000),
    voteSkipActiveWindowMs: jInt("voteSkipActiveWindowMs", 30 * 60_000),

    // ── Image cards ────────────────────────────────────────────────────
    imageRenderingEnabled: jBool("imageRenderingEnabled", true),

    // ── Media check debug ─────────────────────────────────────────────
    mediaCheckDebug: jBool("mediaCheckDebug", false),
  };
}
