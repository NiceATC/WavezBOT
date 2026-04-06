export default {
  name: "ba",
  descriptionKey: "commands.info.ba.description",
  usageKey: "commands.info.ba.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    await ctx.reply(ctx.t("commands.info.ba.reply"));
  },
};
