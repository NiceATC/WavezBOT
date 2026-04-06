import { setSetting } from "../../lib/storage.js";

export default {
  name: "afkremoval",
  aliases: ["afkremove"],
  descriptionKey: "commands.mod.afkremoval.description",
  usageKey: "commands.mod.afkremoval.usage",
  cooldown: 5000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { bot, args, reply, t } = ctx;
    const action = String(args[0] ?? "").toLowerCase();
    let enabled = Boolean(bot.cfg.afkRemovalEnabled);

    if (["on", "true", "1", "enable", "enabled"].includes(action)) {
      enabled = true;
    } else if (["off", "false", "0", "disable", "disabled"].includes(action)) {
      enabled = false;
    } else {
      enabled = !enabled;
    }

    bot.updateConfig("afkRemovalEnabled", enabled);
    await setSetting("afkRemovalEnabled", enabled);
    await reply(
      t(
        enabled
          ? "commands.mod.afkremoval.enabled"
          : "commands.mod.afkremoval.disabled",
      ),
    );
  },
};
