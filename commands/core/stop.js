/**
 * commands/core/stop.js
 */

export default {
  name: "stop",
  aliases: ["pause", "parar", "pausar"],
  descriptionKey: "commands.core.stop.description",
  usageKey: "commands.core.stop.usage",
  cooldown: 5000,
  deleteOn: 60_000,
  minRole: "manager",

  async execute(ctx) {
    const { bot, reply, t } = ctx;
    const changed = bot.pause();
    if (changed) {
      await reply(t("commands.core.stop.reply.paused"));
      return;
    }
    await reply(t("commands.core.stop.reply.alreadyPaused"));
  },
};
