/**
 * commands/mod/kick.js
 */

export default {
  name: "kick",
  aliases: ["expulsar"],
  descriptionKey: "commands.kick.description",
  usageKey: "commands.kick.usage",
  cooldown: 5_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { api, bot, args, reply, t } = ctx;
    const target = (args[0] ?? "").replace(/^@/, "").trim();
    if (!target) {
      await reply(t("commands.kick.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(target);
    if (!user) {
      await reply(t("commands.kick.userNotFound", { user: target }));
      return;
    }

    if (bot.isBotUser(user.userId)) {
      await reply(t("commands.mod.cannotTargetBot"));
      return;
    }

    if (bot.getUserRoleLevel(user.userId) >= bot.getBotRoleLevel()) {
      await reply(
        t("commands.kick.roleTooHigh", {
          user: user.displayName ?? user.username,
        }),
      );
      return;
    }

    try {
      await api.room.kick(bot.cfg.room, user.userId);
      await reply(
        t("commands.kick.removed", {
          user: user.displayName ?? user.username,
        }),
      );
    } catch (err) {
      await reply(t("commands.kick.error", { error: err.message }));
    }
  },
};
