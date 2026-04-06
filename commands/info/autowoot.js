export default {
  name: "autowoot-link",
  aliases: ["bwlink", "wootlink", "autowootlink"],
  descriptionKey: "commands.info.autowoot-link.description",
  usageKey: "commands.info.autowoot-link.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    await ctx.reply(ctx.t("commands.info.autowoot-link.reply"));
  },
};
