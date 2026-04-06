import { setSetting } from "../../lib/storage.js";

export default {
  name: "afklimit",
  aliases: ["afkmax"],
  descriptionKey: "commands.afklimit.description",
  usageKey: "commands.afklimit.usage",
  cooldown: 5000,
  minRole: "manager",

  async execute(ctx) {
    const { bot, args, reply, t } = ctx;
    const minutes = Number(args[0]);
    if (!Number.isFinite(minutes) || minutes < 1) {
      await reply(t("commands.afklimit.usageMessage"));
      return;
    }

    const value = Math.floor(minutes);
    bot.updateConfig("afkLimitMin", value);
    await setSetting("afkLimitMin", value);
    await reply(t("commands.afklimit.updated", { minutes: value }));
  },
};
