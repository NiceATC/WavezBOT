/**
 * commands/core/start.js
 */

export default {
  name: "start",
  aliases: ["resume", "unpause", "continuar", "iniciar"],
  descriptionKey: "commands.start.description",
  usageKey: "commands.start.usage",
  cooldown: 5000,
  minRole: "manager",

  async execute(ctx) {
    const { bot, reply, t } = ctx;
    const changed = bot.resume();
    if (changed) {
      await reply(t("commands.start.reply.resumed"));
      return;
    }
    await reply(t("commands.start.reply.alreadyActive"));
  },
};
