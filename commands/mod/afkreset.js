export default {
  name: "afkreset",
  aliases: ["afkclear"],
  descriptionKey: "commands.afkreset.description",
  usageKey: "commands.afkreset.usage",
  cooldown: 5000,
  minRole: "bouncer",

  async execute(ctx) {
    const { bot, args, sender, reply, t } = ctx;
    const targetInput = (args[0] ?? sender.username ?? sender.displayName ?? "")
      .replace(/^@/, "")
      .trim();

    if (!targetInput) {
      await reply(t("commands.afkreset.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(targetInput);
    if (!user) {
      await reply(t("commands.afkreset.userNotFound", { user: targetInput }));
      return;
    }

    if (bot.isBotUser(user.userId)) {
      await reply(t("commands.mod.cannotTargetBot"));
      return;
    }

    bot.setUserLastChatAt(user.userId);
    const name = user.displayName ?? user.username ?? targetInput;
    await reply(t("commands.afkreset.reset", { user: name }));
  },
};
