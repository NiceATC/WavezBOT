import { pickRandom } from "../../helpers/random.js";

export default {
  name: "fact",
  aliases: ["fato"],
  descriptionKey: "commands.fun.fact.description",
  usageKey: "commands.fun.fact.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { t, tArray, reply } = ctx;
    const fact = pickRandom(tArray("commands.fun.fact.lines"));
    await reply(t("commands.fun.fact.reply", { fact }));
  },
};
