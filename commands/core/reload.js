/**
 * commands/core/reload.js
 */

export default {
  name: "reload",
  aliases: ["reconnect", "restart"],
  descriptionKey: "commands.core.reload.description",
  usageKey: "commands.core.reload.usage",
  cooldown: 10_000,
  deleteOn: 60_000,
  minRole: "manager",

  async execute(ctx) {
    const { bot, reply, t } = ctx;
    await reply(t("commands.core.reload.reply.loading"));
    try {
      await bot.reload();
    } catch (err) {
      await reply(t("commands.core.reload.reply.error", { error: err.message }));
    }
  },
};
