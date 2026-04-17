export default {
  name: "afkreset",
  aliases: ["afkclear"],
  descriptionKey: "commands.mod.afkreset.description",
  usageKey: "commands.mod.afkreset.usage",
  cooldown: 5000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { bot, args, sender, reply, t, mention, mentionUser } = ctx;
    const targetInput = (
      args[0] ??
      sender.username ??
      sender.displayName ??
      ""
    ).trim();

    if (!targetInput) {
      await reply(t("commands.mod.afkreset.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(targetInput);
    if (!user) {
      await reply(
        t("commands.mod.afkreset.userNotFound", { user: mention(targetInput) }),
      );
      return;
    }

    if (bot.isBotUser(user.userId)) {
      await reply(t("commands.mod.cannotTargetBot"));
      return;
    }

    bot.setUserLastChatAt(user.userId);
    const name = mentionUser(user, targetInput);
    await reply(t("commands.mod.afkreset.reset", { user: name }));
  },
};
