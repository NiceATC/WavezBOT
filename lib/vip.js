import { toPointsInt } from "../helpers/points.js";

export const VIP_LEVEL_RANK = Object.freeze({
  none: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
});

export const VIP_LEVEL_BY_RANK = Object.freeze({
  0: "none",
  1: "bronze",
  2: "silver",
  3: "gold",
});

const LEVEL_ALIASES = Object.freeze({
  bronze: "bronze",
  prata: "silver",
  silver: "silver",
  ouro: "gold",
  gold: "gold",
});

const DURATION_ALIASES = Object.freeze({
  diario: "daily",
  daily: "daily",
  semanal: "weekly",
  weekly: "weekly",
  mensal: "monthly",
  monthly: "monthly",
  anual: "yearly",
  yearly: "yearly",
});

const LEVEL_LABELS = Object.freeze({
  bronze: { "pt-BR": "VIP Bronze", "en-US": "VIP Bronze" },
  silver: { "pt-BR": "VIP Prata", "en-US": "VIP Silver" },
  gold: { "pt-BR": "VIP Ouro", "en-US": "VIP Gold" },
  none: { "pt-BR": "Sem VIP", "en-US": "No VIP" },
});

const DURATION_LABELS = Object.freeze({
  daily: { "pt-BR": "Diario", "en-US": "Daily" },
  weekly: { "pt-BR": "Semanal", "en-US": "Weekly" },
  monthly: { "pt-BR": "Mensal", "en-US": "Monthly" },
  yearly: { "pt-BR": "Anual", "en-US": "Yearly" },
});

function formatMultiplier(value) {
  return Number(value ?? 1)
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
}

function getLabel(table, key, locale = "pt-BR") {
  return table?.[key]?.[locale] ?? table?.[key]?.["pt-BR"] ?? String(key);
}

export function normalizeVipLevel(input) {
  const key = String(input ?? "")
    .trim()
    .toLowerCase();
  return LEVEL_ALIASES[key] ?? null;
}

export function normalizeVipDuration(input) {
  const key = String(input ?? "")
    .trim()
    .toLowerCase();
  return DURATION_ALIASES[key] ?? null;
}

export function vipLevelFromRank(rank) {
  return (
    VIP_LEVEL_BY_RANK[Math.max(0, Math.min(3, Number(rank) || 0))] ?? "none"
  );
}

export function vipRankFromLevel(level) {
  const normalized = normalizeVipLevel(level) ?? "none";
  return VIP_LEVEL_RANK[normalized] ?? 0;
}

export function getVipLevelLabel(levelKey, locale = "pt-BR") {
  const normalized = normalizeVipLevel(levelKey) ?? "none";
  return getLabel(LEVEL_LABELS, normalized, locale);
}

export function getVipDurationLabel(durationKey, locale = "pt-BR") {
  const normalized = normalizeVipDuration(durationKey);
  if (!normalized) return String(durationKey ?? "");
  return getLabel(DURATION_LABELS, normalized, locale);
}

export function buildVipPlanKey(levelKey, durationKey) {
  const level = normalizeVipLevel(levelKey);
  const duration = normalizeVipDuration(durationKey);
  if (!level || !duration) return null;
  return `vip_${level}_${duration}`;
}

export function resolveVipState(rawState, now = Date.now()) {
  const rawLevelRank = Math.max(
    0,
    Math.min(3, Number(rawState?.level ?? 0) || 0),
  );
  const rawLevelKey = vipLevelFromRank(rawLevelRank);
  const rawExpiresAt = Math.max(0, Number(rawState?.expiresAt ?? 0) || 0);
  const isExpired = rawLevelRank > 0 && rawExpiresAt > 0 && rawExpiresAt <= now;
  const isActive = rawLevelRank > 0 && rawExpiresAt > now;
  return {
    rawLevelRank,
    rawLevelKey,
    levelRank: isActive ? rawLevelRank : 0,
    levelKey: isActive ? rawLevelKey : "none",
    expiresAt: rawExpiresAt,
    activeExpiresAt: isActive ? rawExpiresAt : 0,
    expiredAt: isExpired ? rawExpiresAt : 0,
    autoRenew:
      rawState?.autoRenew === true || Number(rawState?.autoRenew ?? 0) === 1,
    renewLevelKey: normalizeVipLevel(rawState?.renewLevelKey) ?? null,
    renewDurationKey: normalizeVipDuration(rawState?.renewDurationKey) ?? null,
    isActive,
    isExpired,
  };
}

function getDurationConfig(cfg, durationKey) {
  const durations =
    cfg?.vipDurations && typeof cfg.vipDurations === "object"
      ? cfg.vipDurations
      : {};
  const normalized = normalizeVipDuration(durationKey);
  const item = normalized ? durations[normalized] : null;
  if (!item || typeof item !== "object") return null;
  const days = Number(item.days ?? 0);
  if (!Number.isFinite(days) || days <= 0) return null;
  const discountPct = Math.max(
    0,
    Math.min(90, Number(item.discountPct ?? 0) || 0),
  );
  return { days, discountPct };
}

function getLevelConfig(cfg, levelKey) {
  const levels =
    cfg?.vipLevels && typeof cfg.vipLevels === "object" ? cfg.vipLevels : {};
  const normalized = normalizeVipLevel(levelKey);
  const item = normalized ? levels[normalized] : null;
  if (!item || typeof item !== "object") return null;
  const monthlyPrice = Number(item.monthlyPrice ?? 0);
  if (!Number.isFinite(monthlyPrice) || monthlyPrice <= 0) return null;
  return {
    monthlyPrice,
    xpMultiplier: Math.max(1, Number(item.xpMultiplier ?? 1) || 1),
    economyMultiplier: Math.max(1, Number(item.economyMultiplier ?? 1) || 1),
    dailyMultiplier: Math.max(1, Number(item.dailyMultiplier ?? 1) || 1),
    workMultiplier: Math.max(1, Number(item.workMultiplier ?? 1) || 1),
    dcWindowMultiplier: Math.max(1, Number(item.dcWindowMultiplier ?? 1) || 1),
    afkLimitMultiplier: Math.max(1, Number(item.afkLimitMultiplier ?? 1) || 1),
    shopDiscountPct: Math.max(
      0,
      Math.min(90, Number(item.shopDiscountPct ?? 0) || 0),
    ),
    stealProtectionPct: Math.max(
      0,
      Math.min(0.95, Number(item.stealProtectionPct ?? 0) || 0),
    ),
  };
}

export function getVipBenefits(cfg, levelKey) {
  const normalized = normalizeVipLevel(levelKey);
  if (!normalized) {
    return {
      xpMultiplier: 1,
      economyMultiplier: 1,
      dailyMultiplier: 1,
      workMultiplier: 1,
      dcWindowMultiplier: 1,
      afkLimitMultiplier: 1,
      shopDiscountPct: 0,
      stealProtectionPct: 0,
    };
  }
  const levelCfg = getLevelConfig(cfg, normalized);
  if (!levelCfg) {
    return {
      xpMultiplier: 1,
      economyMultiplier: 1,
      dailyMultiplier: 1,
      workMultiplier: 1,
      dcWindowMultiplier: 1,
      afkLimitMultiplier: 1,
      shopDiscountPct: 0,
      stealProtectionPct: 0,
    };
  }
  return {
    xpMultiplier: levelCfg.xpMultiplier,
    economyMultiplier: levelCfg.economyMultiplier,
    dailyMultiplier: levelCfg.dailyMultiplier,
    workMultiplier: levelCfg.workMultiplier,
    dcWindowMultiplier: levelCfg.dcWindowMultiplier,
    afkLimitMultiplier: levelCfg.afkLimitMultiplier,
    shopDiscountPct: levelCfg.shopDiscountPct,
    stealProtectionPct: levelCfg.stealProtectionPct,
  };
}

export function buildVipPlans(cfg) {
  if (!cfg?.vipEnabled) return [];

  const durations = ["daily", "weekly", "monthly", "yearly"];
  const levels = ["bronze", "silver", "gold"];
  const plans = [];

  for (const levelKey of levels) {
    const levelCfg = getLevelConfig(cfg, levelKey);
    if (!levelCfg) continue;

    for (const durationKey of durations) {
      const durationCfg = getDurationConfig(cfg, durationKey);
      if (!durationCfg) continue;

      const months = durationCfg.days / 30;
      const gross = levelCfg.monthlyPrice * months;
      const discounted = gross * (1 - durationCfg.discountPct / 100);
      const price = toPointsInt(discounted) / 100;
      const durationMs = Math.floor(durationCfg.days * 24 * 60 * 60 * 1000);

      plans.push({
        key: buildVipPlanKey(levelKey, durationKey),
        type: "vip",
        vipLevel: levelKey,
        vipDuration: durationKey,
        vipDurationMs: durationMs,
        vipDiscountPct: durationCfg.discountPct,
        vipDurationDays: durationCfg.days,
        price,
        benefits: getVipBenefits(cfg, levelKey),
        name: {
          "pt-BR": `${getVipLevelLabel(levelKey, "pt-BR")} - ${getVipDurationLabel(durationKey, "pt-BR")}`,
          "en-US": `${getVipLevelLabel(levelKey, "en-US")} - ${getVipDurationLabel(durationKey, "en-US")}`,
        },
        description: {
          "pt-BR": `XP x${formatMultiplier(levelCfg.xpMultiplier)} | Economia x${formatMultiplier(levelCfg.economyMultiplier)} | Daily x${formatMultiplier(levelCfg.dailyMultiplier)} | Work x${formatMultiplier(levelCfg.workMultiplier)} | DC x${formatMultiplier(levelCfg.dcWindowMultiplier)} | AFK x${formatMultiplier(levelCfg.afkLimitMultiplier)} | Loja -${levelCfg.shopDiscountPct}% | Anti-roubo ${Math.round(levelCfg.stealProtectionPct * 100)}%`,
          "en-US": `XP x${formatMultiplier(levelCfg.xpMultiplier)} | Economy x${formatMultiplier(levelCfg.economyMultiplier)} | Daily x${formatMultiplier(levelCfg.dailyMultiplier)} | Work x${formatMultiplier(levelCfg.workMultiplier)} | DC x${formatMultiplier(levelCfg.dcWindowMultiplier)} | AFK x${formatMultiplier(levelCfg.afkLimitMultiplier)} | Shop -${levelCfg.shopDiscountPct}% | Anti-steal ${Math.round(levelCfg.stealProtectionPct * 100)}%`,
        },
      });
    }
  }

  return plans;
}

export function findVipPlanByKey(cfg, key) {
  const wanted = String(key ?? "")
    .trim()
    .toLowerCase();
  if (!wanted) return null;
  return buildVipPlans(cfg).find((plan) => plan.key === wanted) ?? null;
}

export function findVipPlan(cfg, levelKey, durationKey) {
  const key = buildVipPlanKey(levelKey, durationKey);
  return key ? findVipPlanByKey(cfg, key) : null;
}
