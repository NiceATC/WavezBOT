/**
 * commands/core/stop.js
 */

export default {
  name: "stop",
  aliases: ["pause", "parar", "pausar"],
  descriptionKey: "commands.stop.description",
  usageKey: "commands.stop.usage",
  cooldown: 5000,
  minRole: "manager",

  async execute(ctx) {
    const { bot, reply, t } = ctx;
    const changed = bot.pause();
    if (changed) {
      await reply(t("commands.stop.reply.paused"));
      return;
    }
    await reply(t("commands.stop.reply.alreadyPaused"));
  },
};
