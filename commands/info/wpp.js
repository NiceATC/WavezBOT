export default {
  name: "wpp",
  descriptionKey: "commands.info.wpp.description",
  usageKey: "commands.info.wpp.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    await ctx.reply(ctx.t("commands.info.wpp.reply"));
  },
};
