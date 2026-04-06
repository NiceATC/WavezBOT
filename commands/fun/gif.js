import { fetchTenorGif } from "../../helpers/tenor.js";

export default {
  name: "gif",
  aliases: ["giphy"],
  descriptionKey: "commands.fun.gif.description",
  usageKey: "commands.fun.gif.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { t } = ctx;
    const query = String(ctx.rawArgs ?? "").trim();
    try {
      const url = await fetchTenorGif(query);
      if (!url) {
        await ctx.reply(t("commands.fun.gif.notFound"));
        return;
      }
      await ctx.reply(t("commands.fun.gif.result", { url }));
    } catch (err) {
      await ctx.reply(t("commands.fun.gif.error", { error: err.message }));
    }
  },
};
