import { pickRandom } from "../../helpers/random.js";

export default {
  name: "8ball",
  aliases: ["ask"],
  descriptionKey: "commands.eightball.description",
  usageKey: "commands.eightball.usage",
  cooldown: 5000,

  async execute(ctx) {
    const question = String(ctx.rawArgs ?? "").trim();
    if (!question) {
      await ctx.reply(ctx.t("commands.eightball.usageMessage"));
      return;
    }
    const options = ctx.tArray("commands.eightball.responses");
    const answer = pickRandom(options) ?? "";
    await ctx.reply(
      ctx.t("commands.eightball.reply", {
        question,
        answer,
      }),
    );
  },
};
