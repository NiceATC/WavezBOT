import { pickRandom } from "../../helpers/random.js";

export default {
  name: "joke",
  aliases: ["piada"],
  descriptionKey: "commands.joke.description",
  usageKey: "commands.joke.usage",
  cooldown: 5000,

  async execute(ctx) {
    const { t, tArray, reply } = ctx;
    const joke = pickRandom(tArray("commands.joke.lines"));
    await reply(t("commands.joke.reply", { joke }));
  },
};
