export default {
  name: "ba",
  descriptionKey: "commands.ba.description",
  usageKey: "commands.ba.usage",
  cooldown: 5000,

  async execute(ctx) {
    await ctx.reply(ctx.t("commands.ba.reply"));
  },
};
