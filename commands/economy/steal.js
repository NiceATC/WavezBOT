import {
  formatPoints,
  toPointsInt,
  POINT_SCALE,
} from "../../helpers/points.js";
import { getRoleLevel } from "../../lib/permissions.js";

function randomInt(min, max) {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

export default {
  name: "steal",
  aliases: ["roubar"],
  descriptionKey: "commands.economy.steal.description",
  usageKey: "commands.economy.steal.usage",
  cooldown: 15000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, api, sender, args, reply, t, mention, mentionUser } = ctx;
    if (!bot.cfg.economyEnabled || !bot.cfg.stealEnabled) {
      await reply(t("commands.economy.steal.disabled"));
      return;
    }

    const userId = sender.userId;
    if (userId == null) {
      await reply(t("commands.economy.steal.noUser"));
      return;
    }

    const targetInput = String(args[0] ?? "").trim();
    if (!targetInput) {
      await reply(t("commands.economy.steal.usageMessage"));
      return;
    }

    const target = bot.findRoomUser(targetInput);
    if (!target) {
      await reply(
        t("commands.economy.steal.userNotFound", {
          user: mention(targetInput),
        }),
      );
      return;
    }

    if (bot.isBotUser(target.userId)) {
      await reply(t("commands.economy.steal.cannotTargetBot"));
      return;
    }

    if (String(target.userId) === String(userId)) {
      await reply(t("commands.economy.steal.self"));
      return;
    }

    const identity = bot._getUserIdentity(userId, sender);
    const targetIdentity = bot._getUserIdentity(target.userId, target);

    const targetBalance = await bot.getEconomyBalance(
      target.userId,
      targetIdentity,
    );

    const minInt = toPointsInt(bot.cfg.stealMinAmount ?? 0.5);
    const maxInt = toPointsInt(bot.cfg.stealMaxAmount ?? 2);
    const stealProtection = await bot.getVipStealProtection(
      target.userId,
      targetIdentity,
    );

    if (targetBalance < minInt) {
      await reply(
        t("commands.economy.steal.targetPoor", {
          user: mentionUser(target, targetInput),
        }),
      );
      return;
    }

    const rawAmountInt = Math.min(targetBalance, randomInt(minInt, maxInt));
    const amountInt = Math.max(
      Math.min(targetBalance, minInt),
      Math.round(rawAmountInt * (1 - stealProtection)),
    );
    const amount = amountInt / POINT_SCALE;

    const failChance = Math.max(
      0,
      Math.min(0.95, (Number(bot.cfg.stealFailChance) || 0) + stealProtection),
    );
    const failed = Math.random() < failChance;

    if (!failed) {
      const took = await bot.spendEconomyPoints(
        target.userId,
        amount,
        targetIdentity,
      );
      if (took == null) {
        await reply(t("commands.economy.steal.failed"));
        return;
      }
      await bot.awardEconomyPoints(userId, amount, identity);
      await reply(
        t("commands.economy.steal.success", {
          user: mentionUser(target, targetInput),
          amount: formatPoints(amountInt),
        }),
      );
      return;
    }

    const bailInt = toPointsInt(bot.cfg.stealBailAmount ?? 3);
    const balance = await bot.getEconomyBalance(userId, identity);

    if (bailInt > 0 && balance >= bailInt) {
      await bot.spendEconomyPoints(userId, bailInt / POINT_SCALE, identity);
      await reply(
        t("commands.economy.steal.bailPaid", {
          amount: formatPoints(bailInt),
        }),
      );
      return;
    }

    if (bot.getBotRoleLevel() < getRoleLevel("bouncer")) {
      await reply(t("commands.economy.steal.noPermission"));
      return;
    }

    const duration = Math.max(
      1,
      Math.floor(Number(bot.cfg.stealMuteMinutes) || 10),
    );
    try {
      bot.wsMuteUser(userId, duration * 60_000);
      await reply(
        t("commands.economy.steal.muted", {
          minutes: duration,
        }),
      );
    } catch (err) {
      await reply(
        t("commands.economy.steal.muteFailed", { error: err.message }),
      );
    }
  },
};
