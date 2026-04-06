import { fetchTenorGif } from "../../helpers/tenor.js";

export default {
  name: "gif",
  aliases: ["giphy"],
  descriptionKey: "commands.gif.description",
  usageKey: "commands.gif.usage",
  cooldown: 5000,

  async execute(ctx) {
    const { t } = ctx;
    const query = String(ctx.rawArgs ?? "").trim();
    try {
      const url = await fetchTenorGif(query);
      if (!url) {
        await ctx.reply(t("commands.gif.notFound"));
        return;
      }
      await ctx.reply(t("commands.gif.result", { url }));
    } catch (err) {
      await ctx.reply(t("commands.gif.error", { error: err.message }));
    }
  },
};
