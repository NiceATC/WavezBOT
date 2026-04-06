/**
 * commands/mod/skip.js
 */

export default {
  name: "skip",
  aliases: ["pular"],
  descriptionKey: "commands.skip.description",
  usageKey: "commands.skip.usage",
  cooldown: 5_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { api, bot, reply, rawArgs, t } = ctx;
    const reason = String(rawArgs ?? "").trim();
    try {
      await api.room.skipTrack(bot.cfg.room);
      const msg = reason
        ? t("commands.skip.successWithReason", { reason })
        : t("commands.skip.success");
      await reply(msg);
    } catch (err) {
      await reply(t("commands.skip.error", { error: err.message }));
    }
  },
};
