import {
  addWarning,
  clearWarnings,
  getActiveWarningCount,
  listWarnings,
} from "../lib/storage.js";

function toTag(bot, userId) {
  const name = bot.getRoomUserDisplayName(userId) ?? String(userId ?? "");
  if (!name) return "@desconhecido";
  return name.startsWith("@") ? name : `@${name}`;
}

export async function issueWarning(bot, options = {}) {
  const userId = String(options?.userId ?? "").trim();
  if (!userId) return { ok: false, reason: "missing-user" };

  const now = Date.now();
  const expireDays = Math.max(1, Number(bot.cfg.warnExpireDays ?? 30) || 30);
  const expiresAt = now + expireDays * 24 * 60 * 60_000;

  await addWarning({
    userId,
    moderatorUserId: options?.moderatorUserId ?? null,
    reason: options?.reason ?? null,
    source: options?.source ?? "manual",
    createdAt: now,
    expiresAt,
  });

  const count = await getActiveWarningCount(userId);
  const threshold = Math.max(1, Number(bot.cfg.warnBanThreshold ?? 3) || 3);
  const thresholdReached = count >= threshold;
  const banBlockedByPlatformRole =
    thresholdReached && bot.hasPlatformRole(userId);
  const banned =
    thresholdReached &&
    !banBlockedByPlatformRole &&
    bot.getBotRoleLevel() > bot.getUserRoleLevel(userId);

  if (banned) {
    bot.wsBanUser(userId, {
      reason: options?.banReason ?? `Auto-ban por ${count} warns ativos`,
    });
  }

  return {
    ok: true,
    count,
    threshold,
    banned,
    thresholdReached,
    banBlockedByPlatformRole,
    userId,
    expiresAt,
    userTag: toTag(bot, userId),
  };
}

export async function getWarningsForUser(userId, options = {}) {
  return listWarnings(userId, options);
}

export async function clearWarningsForUser(userId) {
  await clearWarnings(userId);
}
