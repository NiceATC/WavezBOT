/**
 * commands/core/reloadcmd.js
 */

export default {
  name: "reloadcmd",
  aliases: ["reloadcommands", "recarregar"],
  descriptionKey: "commands.reloadcmd.description",
  usageKey: "commands.reloadcmd.usage",
  cooldown: 10_000,
  minRole: "manager",

  async execute(ctx) {
    const { bot, reply, t } = ctx;
    try {
      const summary = await bot.reloadCommands();
      const failed = summary?.failed ?? 0;
      const loaded = summary?.loaded ?? 0;
      const msg = failed
        ? t("commands.reloadcmd.reply.successWithFailures", {
            loaded,
            failed,
          })
        : t("commands.reloadcmd.reply.success", { loaded });
      await reply(msg);
    } catch (err) {
      await reply(t("commands.reloadcmd.reply.error", { error: err.message }));
    }
  },
};
