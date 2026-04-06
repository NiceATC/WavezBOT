import { pickRandom } from "../../helpers/random.js";

export default {
  name: "fortune",
  aliases: ["fortuna"],
  descriptionKey: "commands.fortune.description",
  usageKey: "commands.fortune.usage",
  cooldown: 5000,

  async execute(ctx) {
    const line = pickRandom(ctx.tArray("commands.fortune.lines")) ?? "";
    await ctx.reply(ctx.t("commands.fortune.reply", { fortune: line }));
  },
};
