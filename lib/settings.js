// lib/settings.js
// Runtime-configurable settings that can be overridden via storage.

export const RUNTIME_SETTING_KEYS = [
  "autoWoot",
  "botMessage",
  "botMentionCooldownMs",
  "chatKeywordReplyEnabled",
  "chatKeywordReplyCooldownMs",
  "chatKeywordReplySameReplyCooldownMs",
  "chatKeywordReplyRules",
  "cmdPrefix",
  "deleteCommandMessagesEnabled",
  "deleteCommandMessagesDelayMs",
  "greetEnabled",
  "greetMessages",
  "greetBackMessages",
  "greetDeleteMs",
  "greetCooldownMs",
  "lockChatEnabled",
  "lockChatMinRole",
  "motdEnabled",
  "motdInterval",
  "intervalMessages",
  "messageInterval",
  "dcWindowMin",
  "blacklistEnabled",
  "autoSkipEnabled",
  "afkRemovalEnabled",
  "afkLimitMin",
  "duelMuteMin",
  "economyEnabled",
  "economyChatPoints",
  "economyChatCooldownMs",
  "economyDjPoints",
  "economyWootPoints",
  "economyGrabPoints",
  "economyOnlinePointsPerHour",
  "economyTransferMin",
  "xpEnabled",
  "xpChatPoints",
  "xpChatCooldownMs",
  "xpDjPoints",
  "xpWootPoints",
  "xpGrabPoints",
  "xpOnlinePointsPerHour",
  "xpBase",
  "xpExponent",
  "xpRewardBasePoints",
  "xpRewardStepPoints",
  "xpBadgeRewards",
  "xpAchievementRewards",
  "leaderboardReset",
  "memeSubreddits",
  "casinoEnabled",
  "casinoMinBet",
  "casinoMaxBet",
  "casinoCooldownMs",
  "casinoBetMultiplierFactor",
  "casinoMultiplierMax",
  "casinoSlotsSymbols",
  "casinoSlotsPairMultiplier",
  "casinoJackpotEnabled",
  "casinoJackpotLossShare",
  "casinoJackpotSymbol",
  "casinoRouletteBetMultiplierFactor",
  "casinoRouletteRedMultiplier",
  "casinoRouletteBlackMultiplier",
  "casinoRouletteGreenMultiplier",
  "casinoDiceSides",
  "casinoDiceWinMultiplier",
  "dailyRewardAmount",
  "dailyRewardCooldownMs",
  "shopItems",
  "workJobs",
  "workCooldownMs",
  "stealEnabled",
  "stealMinAmount",
  "stealMaxAmount",
  "stealFailChance",
  "stealBailAmount",
  "stealMuteMinutes",
  "bankEnabled",
  "bankInterestRatePerDay",
  "bankRiskChance",
  "bankRiskLossMin",
  "bankRiskLossMax",
  "bankRiskTotalLoss",
  "insuranceEnabled",
  "insurancePricePerDay",
  "insuranceMaxDays",
  "insuranceVipDiscountBronze",
  "insuranceVipDiscountSilver",
  "insuranceVipDiscountGold",
  "quizRewardPoints",
  "quizRewardEasy",
  "quizRewardMedium",
  "quizRewardHard",
  "quizWindowMs",
  "dropRewardPoints",
  "dropWindowMs",
  "warnBanThreshold",
  "warnExpireDays",
  "antiSpamEnabled",
  "antiSpamWindowMs",
  "antiSpamSimilarityThreshold",
  "antiSpamMinRepeats",
  "antiSpamWarnCooldownMs",
  "antiSpamDeleteMessages",
  "voteSkipEnabled",
  "voteSkipThreshold",
  "voteSkipDurationMs",
  "voteSkipActiveWindowMs",
  "imageRenderingEnabled",
  "locale",
];

const RUNTIME_SETTING_SET = new Set(RUNTIME_SETTING_KEYS);

export function filterRuntimeSettings(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, value] of Object.entries(input)) {
    if (RUNTIME_SETTING_SET.has(key)) out[key] = value;
  }
  return out;
}

export function parseSettingValue(raw) {
  if (raw == null) return null;
  if (typeof raw !== "string") return raw;
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed !== "" && !Number.isNaN(Number(trimmed))) {
    return Number(trimmed);
  }
  // Try JSON (arrays/objects) without being too permissive
  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  return raw;
}

export function applyStoredSettings(cfg, stored) {
  const overrides = filterRuntimeSettings(stored);
  return { ...cfg, ...overrides };
}
