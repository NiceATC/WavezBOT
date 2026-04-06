/**
 * commands/core/reload.js
 */

export default {
  name: "reload",
  aliases: ["reconnect", "restart"],
  descriptionKey: "commands.reload.description",
  usageKey: "commands.reload.usage",
  cooldown: 10_000,
  minRole: "manager",

  async execute(ctx) {
    const { bot, reply, t } = ctx;
    await reply(t("commands.reload.reply.loading"));
    try {
      await bot.reload();
    } catch (err) {
      await reply(t("commands.reload.reply.error", { error: err.message }));
    }
  },
};
