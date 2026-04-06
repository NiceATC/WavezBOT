/**
 * commands/mod/kick.js
 */

export default {
  name: "kick",
  aliases: ["expulsar"],
  descriptionKey: "commands.mod.kick.description",
  usageKey: "commands.mod.kick.usage",
  cooldown: 5_000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { api, bot, args, reply, t } = ctx;
    const target = (args[0] ?? "").replace(/^@/, "").trim();
    if (!target) {
      await reply(t("commands.mod.kick.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(target);
    if (!user) {
      await reply(t("commands.mod.kick.userNotFound", { user: target }));
      return;
    }

    if (bot.isBotUser(user.userId)) {
      await reply(t("commands.mod.cannotTargetBot"));
      return;
    }

    if (bot.getUserRoleLevel(user.userId) >= bot.getBotRoleLevel()) {
      await reply(
        t("commands.mod.kick.roleTooHigh", {
          user: user.displayName ?? user.username,
        }),
      );
      return;
    }

    try {
      bot.wsKickUser(user.userId);
      await reply(
        t("commands.mod.kick.removed", {
          user: user.displayName ?? user.username,
        }),
      );
    } catch (err) {
      await reply(t("commands.mod.kick.error", { error: err.message }));
    }
  },
};
