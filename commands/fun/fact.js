import { pickRandom } from "../../helpers/random.js";

export default {
  name: "fact",
  aliases: ["fato"],
  descriptionKey: "commands.fact.description",
  usageKey: "commands.fact.usage",
  cooldown: 5000,

  async execute(ctx) {
    const { t, tArray, reply } = ctx;
    const fact = pickRandom(tArray("commands.fact.lines"));
    await reply(t("commands.fact.reply", { fact }));
  },
};
