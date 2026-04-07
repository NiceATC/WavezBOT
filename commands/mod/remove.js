/**
 * commands/mod/remove.js
 */

export default {
  name: "remove",
  aliases: ["remover", "rm"],
  descriptionKey: "commands.mod.remove.description",
  usageKey: "commands.mod.remove.usage",
  cooldown: 5_000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { api, bot, args, reply, t } = ctx;
    const target = (args[0] ?? "").replace(/^@/, "").trim();
    if (!target) {
      await reply(t("commands.mod.remove.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(target);
    if (!user) {
      await reply(t("commands.mod.remove.userNotFound", { user: target }));
      return;
    }

    if (bot.isBotUser(user.userId)) {
      await reply(t("commands.mod.cannotTargetBot"));
      return;
    }

    try {
      const qRes = await api.room.getQueueStatus(bot.cfg.room);
      const queueIds = qRes?.data?.queueUserIds ?? [];
      const inList = queueIds.includes(String(user.userId));

      if (!inList) {
        await reply(t("commands.mod.remove.notInQueue", { user: target }));
        return;
      }

      bot.wsRemoveFromQueue(user.userId);
      await reply(
        t("commands.mod.remove.removed", {
          user: user.displayName ?? user.username,
        }),
      );
    } catch (err) {
      await reply(t("commands.mod.remove.error", { error: err.message }));
    }
  },
};
