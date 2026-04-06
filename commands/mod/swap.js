/**
 * commands/mod/swap.js
 */

import { getWaitlist } from "../../helpers/waitlist.js";

export default {
  name: "swap",
  aliases: ["trocar"],
  descriptionKey: "commands.mod.swap.description",
  usageKey: "commands.mod.swap.usage",
  cooldown: 5_000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { api, bot, args, reply, t } = ctx;
    const targetA = (args[0] ?? "").replace(/^@/, "").trim();
    const targetB = (args[1] ?? "").replace(/^@/, "").trim();

    if (!targetA || !targetB) {
      await reply(t("commands.mod.swap.usageMessage"));
      return;
    }

    const userA = bot.findRoomUser(targetA);
    const userB = bot.findRoomUser(targetB);
    if (!userA || !userB) {
      await reply(t("commands.mod.swap.userNotFound"));
      return;
    }

    if (bot.isBotUser(userA.userId) || bot.isBotUser(userB.userId)) {
      await reply(t("commands.mod.cannotTargetBot"));
      return;
    }

    try {
      const wl = await getWaitlist(api, bot.cfg.room);
      const idxA = wl.findIndex(
        (u) => String(u.id ?? u.userId) === String(userA.userId),
      );
      const idxB = wl.findIndex(
        (u) => String(u.id ?? u.userId) === String(userB.userId),
      );

      if (idxA < 0 || idxB < 0) {
        await reply(t("commands.mod.swap.notInQueue"));
        return;
      }

      if (idxA === idxB) {
        await reply(t("commands.mod.swap.samePosition"));
        return;
      }

      if (idxA < idxB) {
        bot.wsReorderQueue(userB.userId, idxA);
        bot.wsReorderQueue(userA.userId, idxB);
      } else {
        bot.wsReorderQueue(userA.userId, idxB);
        bot.wsReorderQueue(userB.userId, idxA);
      }

      await reply(
        t("commands.mod.swap.success", {
          userA: userA.displayName ?? userA.username,
          userB: userB.displayName ?? userB.username,
        }),
      );
    } catch (err) {
      await reply(t("commands.mod.swap.error", { error: err.message }));
    }
  },
};
