import { pickRandom } from "../../helpers/random.js";

export default {
  name: "coin",
  aliases: ["flip"],
  descriptionKey: "commands.coin.description",
  usageKey: "commands.coin.usage",
  cooldown: 3000,

  async execute(ctx) {
    const { t, tArray, reply } = ctx;
    const result = pickRandom(tArray("commands.coin.results"));
    await reply(t("commands.coin.reply", { result }));
  },
};
