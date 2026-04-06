import { pickRandom } from "../../helpers/random.js";

export default {
  name: "coin",
  aliases: ["flip"],
  descriptionKey: "commands.fun.coin.description",
  usageKey: "commands.fun.coin.usage",
  cooldown: 3000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { t, tArray, reply } = ctx;
    const result = pickRandom(tArray("commands.fun.coin.results"));
    await reply(t("commands.fun.coin.reply", { result }));
  },
};
