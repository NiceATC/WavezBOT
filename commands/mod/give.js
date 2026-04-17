import { extractDurationAndReason } from "../../helpers/duration.js";
import { formatPoints, toPointsInt } from "../../helpers/points.js";
import {
  getVipDurationLabel,
  getVipLevelLabel,
  normalizeVipDuration,
  normalizeVipLevel,
} from "../../lib/vip.js";

function parseAmount(input) {
  const raw = String(input ?? "")
    .trim()
    .replace(",", ".");
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function parseVipGrant(bot, tokens) {
  let levelKey = null;
  let durationKey = null;
  const remaining = [];

  for (const token of tokens) {
    const maybeLevel = normalizeVipLevel(token);
    if (!levelKey && maybeLevel) {
      levelKey = maybeLevel;
      continue;
    }
    const maybeDuration = normalizeVipDuration(token);
    if (!durationKey && maybeDuration) {
      durationKey = maybeDuration;
      continue;
    }
    remaining.push(token);
  }

  levelKey ||= "bronze";

  if (durationKey) {
    const plan = bot.getVipPlan(levelKey, durationKey);
    if (!plan) return { ok: false };
    return {
      ok: true,
      levelKey,
      durationKey,
      durationMs: plan.vipDurationMs,
      durationLabel: getVipDurationLabel(durationKey),
    };
  }

  const { duration, label } = extractDurationAndReason(remaining);
  if (!duration) return { ok: false };

  return {
    ok: true,
    levelKey,
    durationKey: null,
    durationMs: duration * 60 * 1000,
    durationLabel: label,
  };
}

export default {
  name: "give",
  descriptionKey: "commands.mod.give.description",
  usageKey: "commands.mod.give.usage",
  cooldown: 2000,
  deleteOn: 60_000,
  minRole: "cohost",

  async execute(ctx) {
    const { bot, args, reply, mention, mentionUser, t, locale } = ctx;
    const type = String(args[0] ?? "")
      .trim()
      .toLowerCase();
    const targetInput = String(args[1] ?? "").trim();

    if (!type || !targetInput || !["points", "vip"].includes(type)) {
      await reply(t("commands.mod.give.usageMessage"));
      return;
    }

    const target = bot.findRoomUser(targetInput);
    if (!target) {
      await reply(
        t("commands.mod.give.userNotFound", { user: mention(targetInput) }),
      );
      return;
    }

    const identity = bot._getUserIdentity(target.userId, target);

    if (type === "points") {
      const amount = parseAmount(args[2]);
      if (amount == null || amount <= 0) {
        await reply(t("commands.mod.give.invalidAmount"));
        return;
      }

      const nextBalance = await bot.awardEconomyPoints(
        target.userId,
        amount,
        identity,
        { applyVipMultiplier: false },
      );

      await reply(
        t("commands.mod.give.pointsGranted", {
          user: mentionUser(target, targetInput),
          amount: formatPoints(toPointsInt(amount)),
          balance: formatPoints(nextBalance ?? 0),
        }),
      );
      return;
    }

    const parsedVip = parseVipGrant(bot, args.slice(2));
    if (!parsedVip.ok) {
      await reply(t("commands.mod.give.vipUsage"));
      return;
    }

    const result = await bot.grantVip(
      target.userId,
      {
        levelKey: parsedVip.levelKey,
        durationMs: parsedVip.durationMs,
        durationKey: parsedVip.durationKey,
      },
      identity,
    );

    if (!result?.ok) {
      if (result?.code === "higher_level_active") {
        await reply(
          t("commands.mod.give.vipHigherLevel", {
            user: mentionUser(target, targetInput),
          }),
        );
        return;
      }
      await reply(t("commands.mod.give.vipFailed"));
      return;
    }

    await reply(
      t("commands.mod.give.vipGranted", {
        user: mentionUser(target, targetInput),
        level: getVipLevelLabel(parsedVip.levelKey, locale),
        duration: parsedVip.durationKey
          ? getVipDurationLabel(parsedVip.durationKey, locale)
          : parsedVip.durationLabel,
      }),
    );
  },
};
