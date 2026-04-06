/**
 * commands/togglebl.js
 *
 * !togglebl - ativa/desativa a blacklist de musicas
 */

import { setSetting } from "../../lib/storage.js";

export default {
  name: "togglebl",
  aliases: ["bltoggle", "blacklisttoggle"],
  descriptionKey: "commands.togglebl.description",
  usageKey: "commands.togglebl.usage",
  cooldown: 5000,
  minRole: "bouncer",

  async execute(ctx) {
    const { bot, args, reply, t } = ctx;
    const action = String(args[0] ?? "").toLowerCase();
    let enabled = Boolean(bot.cfg.blacklistEnabled);

    if (["on", "true", "1", "enable", "enabled"].includes(action)) {
      enabled = true;
    } else if (["off", "false", "0", "disable", "disabled"].includes(action)) {
      enabled = false;
    } else {
      enabled = !enabled;
    }

    bot.updateConfig("blacklistEnabled", enabled);
    await setSetting("blacklistEnabled", enabled);
    await reply(
      t(enabled ? "commands.togglebl.enabled" : "commands.togglebl.disabled"),
    );
  },
};
