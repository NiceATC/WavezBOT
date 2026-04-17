/**
 * commands/mod/swap.js
 */

import {
  getQueueEntryUserId,
  getWaitlistPositionForIndex,
} from "../../lib/waitlist.js";

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
    const targetA = (args[0] ?? "").trim();
    const targetB = (args[1] ?? "").trim();

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
      const qRes = await api.room.getQueueStatus(bot.cfg.room);
      const entries = Array.isArray(qRes?.data?.entries)
        ? qRes.data.entries
        : [];
      const idxA = entries.findIndex(
        (entry) => getQueueEntryUserId(entry) === String(userA.userId),
      );
      const idxB = entries.findIndex(
        (entry) => getQueueEntryUserId(entry) === String(userB.userId),
      );
      const posA = getWaitlistPositionForIndex(idxA, entries);
      const posB = getWaitlistPositionForIndex(idxB, entries);

      if (posA == null || posB == null) {
        await reply(t("commands.mod.swap.notInQueue"));
        return;
      }

      if (posA === posB) {
        await reply(t("commands.mod.swap.samePosition"));
        return;
      }

      if (posA < posB) {
        bot.wsReorderQueue(userB.userId, posA - 1);
        bot.wsReorderQueue(userA.userId, posB - 1);
      } else {
        bot.wsReorderQueue(userA.userId, posB - 1);
        bot.wsReorderQueue(userB.userId, posA - 1);
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
