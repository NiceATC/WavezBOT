/**
 * lib/config.js
 *
 * Configuration is split into:
 *
 *   .env              — secrets only: BOT_EMAIL, BOT_PASSWORD (or BOT_TOKEN)
 *   config/core.json        — sala, rede, prefixo
 *   config/bot.json         — comportamento do bot, saudações, MOTD, keywords
 *   config/moderation.json  — blacklist, AFK, lock, voteskip, DC
 *   config/economy.json     — economia, casino, diário, loja, work, steal
 *   config/xp.json          — XP, níveis, badges, conquistas, leaderboard
 *   config/ui.json          — dashboard, temas, memes, renderização
 *
 * Fallback: se a pasta config/ não existir, tenta ler config.json legado.
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

// ── config/ folder — split config files ──────────────────────────────────────

const CONFIG_DIR = path.join(ROOT, "config");
const CONFIG_FILES = [
  "core",
  "bot",
  "moderation",
  "economy",
  "xp",
  "ui",
  "vip",
  "commands",
];

/**
 * Load a JSON file, stripping _comment fields.
 * Returns {} on failure instead of crashing for optional files.
 */
function loadJsonFile(filePath, required = false) {
  if (!fs.existsSync(filePath)) {
    if (required) {
      console.error(translate("config.configMissing", { path: filePath }));
      process.exit(1);
    }
    return {};
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    // Strip _comment fields before merging
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!k.startsWith("_")) out[k] = v;
    }
    return out;
  } catch (err) {
    console.error(
      translate("config.parseFailed", { error: `${filePath}: ${err.message}` }),
    );
    process.exit(1);
  }
}

let _json;

function loadMergedJsonConfig() {
  if (fs.existsSync(CONFIG_DIR) && fs.statSync(CONFIG_DIR).isDirectory()) {
    // ── New split config structure ──────────────────────────────────────────
    const next = {};
    for (const name of CONFIG_FILES) {
      const filePath = path.join(CONFIG_DIR, `${name}.json`);
      const partial = loadJsonFile(filePath, name === "core");
      Object.assign(next, partial);
    }
    return next;
  }

  // ── Legacy fallback: single config.json ──────────────────────────────────
  const configPath = path.join(ROOT, "config.json");
  const examplePath = path.join(ROOT, "config.example.json");

  if (!fs.existsSync(configPath)) {
    if (fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, configPath);
      console.warn(translate("config.configCopied"));
    } else {
      console.error(translate("config.configMissing", { path: configPath }));
      process.exit(1);
    }
  }

  return loadJsonFile(configPath, true);
}

export function reloadConfigSource() {
  _json = loadMergedJsonConfig();
  return _json;
}

reloadConfigSource();

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
  const jStrArr = (key, fallback = []) => {
    const value = j(key, fallback);
    if (Array.isArray(value)) {
      return value.map((item) => String(item ?? "").trim()).filter(Boolean);
    }
    const single = String(value ?? "").trim();
    return single ? [single] : fallback;
  };

  const jBoolMap = (key) => {
    const obj = jObj(key, {});
    const out = {};

    const visit = (node) => {
      if (!node || typeof node !== "object" || Array.isArray(node)) return;
      for (const [k, v] of Object.entries(node)) {
        if (typeof v === "boolean") {
          // Use leaf key as the runtime command/event name.
          out[k] = v;
          continue;
        }
        if (v && typeof v === "object" && !Array.isArray(v)) {
          visit(v);
        }
      }
    };

    visit(obj);
    return out;
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
  const legacyTrafficLogPath = jStr(
    "apiTrafficLogPath",
    "logs/wavez-api-traffic.jsonl",
  );
  const legacyTrafficLogDir = path.dirname(legacyTrafficLogPath);

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

    // ── Debug logging (REST + WS da API, separados por categoria) ─────────
    debug: jBool("debug", jBool("apiTrafficLogEnabled", false)),
    debugLogDir: jStr("debugLogDir", legacyTrafficLogDir),
    maxDebugFileMB: jNum("maxDebugFileMB", jNum("apiTrafficLogMaxFileMB", 256)),
    maxDebugEntryKB: jNum(
      "maxDebugEntryKB",
      jNum("apiTrafficLogMaxEntryKB", 2048),
    ),
    debugRest: jBool("debugRest", jBool("apiTrafficLogRest", true)),
    debugWs: jBool("debugWs", jBool("apiTrafficLogWs", true)),
    debugCommandUserIds: jStrArr("debugCommandUserIds", []),

    // ── Command system ───────────────────────────────────────────────────────
    cmdPrefix: jStr("cmdPrefix", "!"),
    deleteCommandMessagesEnabled: jBool("deleteCommandMessagesEnabled", false),
    deleteCommandMessagesDelayMs: jInt("deleteCommandMessagesDelayMs", 0),
    commandToggles: jBoolMap("commandToggles"),
    eventToggles: jBoolMap("eventToggles"),

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

    // ── VIP ───────────────────────────────────────────────────────────
    vipEnabled: jBool("vipEnabled", true),
    vipJoinCheckEnabled: jBool("vipJoinCheckEnabled", true),
    vipRenewPromptCooldownMs: jInt("vipRenewPromptCooldownMs", 21_600_000),
    vipLevels: jObj("vipLevels", {}),
    vipDurations: jObj("vipDurations", {}),

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
    bankEnabled: jBool("bankEnabled", true),
    bankInterestRatePerDay: jNum("bankInterestRatePerDay", 0.01),
    bankRiskChance: jNum("bankRiskChance", 0.05),
    bankRiskLossMin: jNum("bankRiskLossMin", 0.05),
    bankRiskLossMax: jNum("bankRiskLossMax", 0.2),
    bankRiskTotalLoss: jBool("bankRiskTotalLoss", false),
    insuranceEnabled: jBool("insuranceEnabled", true),
    insurancePricePerDay: jNum("insurancePricePerDay", 5),
    insuranceMaxDays: jInt("insuranceMaxDays", 30),
    insuranceVipDiscountBronze: jNum("insuranceVipDiscountBronze", 0.1),
    insuranceVipDiscountSilver: jNum("insuranceVipDiscountSilver", 0.2),
    insuranceVipDiscountGold: jNum("insuranceVipDiscountGold", 0.3),

    // ── Moderation: warnings / anti-spam ───────────────────────────
    warnBanThreshold: jInt("warnBanThreshold", 3),
    warnExpireDays: jInt("warnExpireDays", 30),
    antiSpamEnabled: jBool("antiSpamEnabled", true),
    antiSpamWindowMs: jInt("antiSpamWindowMs", 15_000),
    antiSpamSimilarityThreshold: jNum("antiSpamSimilarityThreshold", 0.9),
    antiSpamMinRepeats: jInt("antiSpamMinRepeats", 3),
    antiSpamWarnCooldownMs: jInt("antiSpamWarnCooldownMs", 60_000),
    antiSpamDeleteMessages: jBool("antiSpamDeleteMessages", true),

    // ── Vote skip ───────────────────────────────────────────────────
    voteSkipEnabled: jBool("voteSkipEnabled", true),
    voteSkipThreshold: jNum("voteSkipThreshold", 0.3),
    voteSkipDurationMs: jInt("voteSkipDurationMs", 60_000),
    voteSkipActiveWindowMs: jInt("voteSkipActiveWindowMs", 30 * 60_000),

    // ── Image cards ────────────────────────────────────────────────────
    imageRenderingEnabled: jBool("imageRenderingEnabled", true),

    // ── Media check debug ─────────────────────────────────────────────
    mediaCheckDebug: jBool("mediaCheckDebug", false),

    // ── Fun / Roulette ─────────────────────────────────────────────────
    rouletteDurationMs: jInt("fun.rouletteDurationMs", 60_000),
    rouletteMinParticipants: jInt("fun.rouletteMinParticipants", 3),
    autoRouletteEnabled: jBool("fun.autoRouletteEnabled", false),
    autoRouletteIntervalMs: jInt("fun.autoRouletteIntervalMs", 900_000),
    quizRewardPoints: jNum("fun.quizRewardPoints", 5),
    quizRewardEasy: jNum("fun.quizRewardEasy", 3),
    quizRewardMedium: jNum("fun.quizRewardMedium", 5),
    quizRewardHard: jNum("fun.quizRewardHard", 10),
    quizWindowMs: jInt("fun.quizWindowMs", 45_000),
    dropRewardPoints: jNum("fun.dropRewardPoints", 3),
    dropWindowMs: jInt("fun.dropWindowMs", 20_000),
    autoEventsEnabled: jBool("fun.autoEventsEnabled", false),
    autoEventsMinIntervalMs: jInt("fun.autoEventsMinIntervalMs", 900_000),
    autoEventsMaxIntervalMs: jInt("fun.autoEventsMaxIntervalMs", 1_800_000),
    autoQuizChancePct: jInt("fun.autoQuizChancePct", 60),
  };
}
