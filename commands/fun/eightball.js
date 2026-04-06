import { pickRandom } from "../../helpers/random.js";

export default {
  name: "8ball",
  aliases: ["ask"],
  descriptionKey: "commands.fun.eightball.description",
  usageKey: "commands.fun.eightball.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    const question = String(ctx.rawArgs ?? "").trim();
    if (!question) {
      await ctx.reply(ctx.t("commands.fun.eightball.usageMessage"));
      return;
    }
    const options = ctx.tArray("commands.fun.eightball.responses");
    const answer = pickRandom(options) ?? "";
    await ctx.reply(
      ctx.t("commands.fun.eightball.reply", {
        question,
        answer,
      }),
    );
  },
};
