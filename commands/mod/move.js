/**
 * commands/mod/move.js
 */

export default {
  name: "move",
  aliases: ["mover", "mv"],
  descriptionKey: "commands.mod.move.description",
  usageKey: "commands.mod.move.usage",
  cooldown: 5_000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { api, bot, args, reply, t, mention, mentionUser } = ctx;
    const target = (args[0] ?? "").trim();
    const pos = parseInt(args[1], 10);
    if (!target || isNaN(pos) || pos < 1) {
      await reply(t("commands.mod.move.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(target);
    if (!user) {
      await reply(
        t("commands.mod.move.userNotFound", { user: mention(target) }),
      );
      return;
    }

    if (bot.isBotUser(user.userId)) {
      await reply(t("commands.mod.cannotTargetBot"));
      return;
    }

    try {
      const apiPos = pos - 1;
      bot.wsReorderQueue(user.userId, apiPos);
      await reply(
        t("commands.mod.move.moved", {
          user: mentionUser(user, target),
          position: pos,
        }),
      );
    } catch (err) {
      await reply(t("commands.mod.move.error", { error: err.message }));
    }
  },
};
