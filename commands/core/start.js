/**
 * commands/core/start.js
 */

export default {
  name: "start",
  aliases: ["resume", "unpause", "continuar", "iniciar"],
  descriptionKey: "commands.core.start.description",
  usageKey: "commands.core.start.usage",
  cooldown: 5000,
  deleteOn: 60_000,
  minRole: "manager",

  async execute(ctx) {
    const { bot, reply, t } = ctx;
    const changed = bot.resume();
    if (changed) {
      await reply(t("commands.core.start.reply.resumed"));
      return;
    }
    await reply(t("commands.core.start.reply.alreadyActive"));
  },
};
