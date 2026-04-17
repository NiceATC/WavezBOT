/**
 * commands/ping.js
 *
 * !ping — check if the bot is alive; replies with latency hint
 */

export default {
  name: "ping",
  aliases: ["pong"],
  descriptionKey: "commands.core.ping.description",
  usageKey: "commands.core.ping.usage",
  cooldown: 5_000,
  deleteOn: 60_000,

  async execute(ctx) {
    const start = process.hrtime.bigint();
    const rawUser =
      ctx.sender.displayName ?? ctx.sender.username ?? ctx.t("common.you");
    const user = ctx.mention(rawUser);
    // Yield once so the measurement includes async scheduling overhead.
    await Promise.resolve();
    const elapsedMs = Number((process.hrtime.bigint() - start) / 1000000n);
    const ms = Math.max(1, elapsedMs);

    await ctx.reply(
      ctx.t("commands.core.ping.reply", {
        user,
        ms,
      }),
    );
  },
};
