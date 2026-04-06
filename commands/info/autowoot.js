export default {
  name: "autowoot-link",
  aliases: ["bwlink", "wootlink", "autowootlink"],
  descriptionKey: "commands.autowoot-link.description",
  usageKey: "commands.autowoot-link.usage",
  cooldown: 5000,

  async execute(ctx) {
    await ctx.reply(ctx.t("commands.autowoot-link.reply"));
  },
};
