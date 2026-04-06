export default {
  name: "ghostbuster",
  descriptionKey: "commands.fun.ghostbuster.description",
  usageKey: "commands.fun.ghostbuster.usage",
  cooldown: 5000,
  deleteOn: 60_000,

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
      await ctx.reply(t("commands.fun.ghostbuster.present", { name }));
      return;
    }
    await ctx.reply(t("commands.fun.ghostbuster.absent", { name }));
  },
};
