/**
 * commands/ping.js
 *
 * !ping — check if the bot is alive; replies with latency hint
 */

export default {
  name: "ping",
  aliases: ["pong"],
  descriptionKey: "commands.ping.description",
  usageKey: "commands.ping.usage",
  cooldown: 5_000,
  deleteOn: 5000,

  async execute(ctx) {
    const start = Date.now();
    const user = ctx.sender.username ?? ctx.t("common.you");
    await ctx.reply(
      ctx.t("commands.ping.reply", {
        user,
        ms: Date.now() - start,
      }),
    );
  },
};
