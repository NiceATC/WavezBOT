import { pickRandom } from "../../helpers/random.js";

export default {
  name: "joke",
  aliases: ["piada"],
  descriptionKey: "commands.fun.joke.description",
  usageKey: "commands.fun.joke.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { t, tArray, reply } = ctx;
    const joke = pickRandom(tArray("commands.fun.joke.lines"));
    await reply(t("commands.fun.joke.reply", { joke }));
  },
};
