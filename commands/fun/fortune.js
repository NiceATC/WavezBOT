import { pickRandom } from "../../helpers/random.js";

export default {
  name: "fortune",
  aliases: ["fortuna"],
  descriptionKey: "commands.fun.fortune.description",
  usageKey: "commands.fun.fortune.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    const line = pickRandom(ctx.tArray("commands.fun.fortune.lines")) ?? "";
    await ctx.reply(ctx.t("commands.fun.fortune.reply", { fortune: line }));
  },
};
