/**
 * commands/autowoot.js
 *
 * !autowoot - alterna o auto-woot do bot
 */

import { setSetting } from "../../lib/storage.js";

export default {
  name: "autowoot",
  aliases: ["aw"],
  descriptionKey: "commands.autowoot.description",
  usageKey: "commands.autowoot.usage",
  cooldown: 5000,
  minRole: "manager",

  async execute(ctx) {
    const { bot, args, reply, t } = ctx;
    const action = String(args[0] ?? "").toLowerCase();
    let enabled = Boolean(bot.cfg.autoWoot);

    if (["on", "true", "1", "enable", "enabled"].includes(action)) {
      enabled = true;
    } else if (["off", "false", "0", "disable", "disabled"].includes(action)) {
      enabled = false;
    } else {
      enabled = !enabled;
    }

    bot.updateConfig("autoWoot", enabled);
    await setSetting("autoWoot", enabled);
    await reply(
      t(enabled ? "commands.autowoot.enabled" : "commands.autowoot.disabled"),
    );
  },
};
