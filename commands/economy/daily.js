import { formatDuration } from "../../helpers/time.js";
import { formatPoints, toPointsInt } from "../../helpers/points.js";
import { getDailyRewardState, setDailyRewardState } from "../../lib/storage.js";

export default {
  name: "daily",
  aliases: ["diario", "reward"],
  descriptionKey: "commands.economy.daily.description",
  usageKey: "commands.economy.daily.usage",
  cooldown: 3000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, sender, reply, t } = ctx;
    if (!bot.cfg.economyEnabled) {
      await reply(t("commands.economy.daily.disabled"));
      return;
    }

    const userId = sender.userId;
    if (userId == null) {
      await reply(t("commands.economy.daily.noUser"));
      return;
    }

    const cooldownMs = Math.max(0, Number(bot.cfg.dailyRewardCooldownMs) || 0);
    const amount = Math.max(0, Number(bot.cfg.dailyRewardAmount) || 0);
    if (!amount || cooldownMs <= 0) {
      await reply(t("commands.economy.daily.unavailable"));
      return;
    }

    const state = await getDailyRewardState(userId);
    const now = Date.now();
    const lastClaim =
      Number(state?.last_claim_at ?? state?.lastClaimAt ?? 0) || 0;

    if (lastClaim && now - lastClaim < cooldownMs) {
      const remaining = cooldownMs - (now - lastClaim);
      await reply(
        t("commands.economy.daily.cooldown", {
          remaining: formatDuration(remaining),
        }),
      );
      return;
    }

    const identity = bot._getUserIdentity(userId, sender);
    await bot.awardEconomyPoints(userId, amount, identity);

    const nextStreak =
      lastClaim && now - lastClaim <= cooldownMs * 2
        ? Math.max(0, Number(state?.streak ?? 0)) + 1
        : 1;

    await setDailyRewardState({
      userId,
      lastClaimAt: now,
      streak: nextStreak,
    });

    await reply(
      t("commands.economy.daily.claimed", {
        amount: formatPoints(toPointsInt(amount)),
        streak: nextStreak,
      }),
    );
  },
};
