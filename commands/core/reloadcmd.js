/**
 * commands/core/reloadcmd.js
 */

export default {
  name: "reloadcmd",
  aliases: ["reloadcommands", "recarregar"],
  descriptionKey: "commands.core.reloadcmd.description",
  usageKey: "commands.core.reloadcmd.usage",
  cooldown: 10_000,
  deleteOn: 60_000,
  minRole: "manager",

  async execute(ctx) {
    const { bot, reply, t } = ctx;
    try {
      const summary = await bot.reloadCommands();
      const failed = summary?.failed ?? 0;
      const loaded = summary?.loaded ?? 0;
      const msg = failed
        ? t("commands.core.reloadcmd.reply.successWithFailures", {
            loaded,
            failed,
          })
        : t("commands.core.reloadcmd.reply.success", { loaded });
      await reply(msg);
    } catch (err) {
      await reply(t("commands.core.reloadcmd.reply.error", { error: err.message }));
    }
  },
};
