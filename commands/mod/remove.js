/**
 * commands/mod/remove.js
 */

import { getWaitlist } from "../../helpers/waitlist.js";

export default {
  name: "remove",
  aliases: ["remover", "rm"],
  descriptionKey: "commands.remove.description",
  usageKey: "commands.remove.usage",
  cooldown: 5_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { api, bot, args, reply, t } = ctx;
    const target = (args[0] ?? "").replace(/^@/, "").trim();
    if (!target) {
      await reply(t("commands.remove.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(target);
    if (!user) {
      await reply(t("commands.remove.userNotFound", { user: target }));
      return;
    }

    if (bot.isBotUser(user.userId)) {
      await reply(t("commands.mod.cannotTargetBot"));
      return;
    }

    try {
      const wl = await getWaitlist(api, bot.cfg.room);
      const inList = wl.some(
        (u) => String(u.id ?? u.userId) === String(user.userId),
      );

      if (!inList) {
        await reply(t("commands.remove.notInQueue", { user: target }));
        return;
      }

      await api.room.removeFromWaitlist(bot.cfg.room, Number(user.userId));
      await reply(
        t("commands.remove.removed", {
          user: user.displayName ?? user.username,
        }),
      );
    } catch (err) {
      await reply(t("commands.remove.error", { error: err.message }));
    }
  },
};
