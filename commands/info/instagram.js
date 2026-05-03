export default {
  name: "insta",
  descriptionKey: "commands.info.insta.description",
  usageKey: "commands.info.insta.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    await ctx.reply(ctx.t("commands.info.insta.reply"));
  },
};
