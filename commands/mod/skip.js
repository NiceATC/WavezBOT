/**
 * commands/mod/skip.js
 */

export default {
  name: "skip",
  aliases: ["pular"],
  descriptionKey: "commands.mod.skip.description",
  usageKey: "commands.mod.skip.usage",
  cooldown: 5_000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { bot, reply, rawArgs, t } = ctx;
    const reason = String(rawArgs ?? "").trim();
    const msg = reason
      ? t("commands.mod.skip.successWithReason", { reason })
      : t("commands.mod.skip.success");
    try {
      const ok = await bot.safeSkip({ message: msg });
      if (!ok)
        await reply(
          t("commands.mod.skip.error", {
            error: "skip already in progress or no active track",
          }),
        );
    } catch (err) {
      await reply(t("commands.mod.skip.error", { error: err.message }));
    }
  },
};
