export default {
  name: "ghostbuster",
  descriptionKey: "commands.ghostbuster.description",
  usageKey: "commands.ghostbuster.usage",
  cooldown: 5000,

  async execute(ctx) {
    const { bot, sender, t } = ctx;
    const targetInput = String(ctx.rawArgs ?? "")
      .replace(/^@/, "")
      .trim();
    const name =
      targetInput ||
      sender.username ||
      sender.displayName ||
      t("common.someone");
    const user = bot.findRoomUser(name);
    if (user) {
      await ctx.reply(t("commands.ghostbuster.present", { name }));
      return;
    }
    await ctx.reply(t("commands.ghostbuster.absent", { name }));
  },
};
