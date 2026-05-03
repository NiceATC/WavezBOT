export default {
  name: "discord",
  descriptionKey: "commands.info.discord.description",
  usageKey: "commands.info.discord.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    await ctx.reply(ctx.t("commands.info.discord.reply"));
  },
};
