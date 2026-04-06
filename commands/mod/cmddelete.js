/**
 * commands/mod/cmddelete.js
 *
 * Toggle auto-deletion of command messages.
 */

import { setSetting } from "../../lib/storage.js";

export default {
  name: "cmddelete",
  aliases: ["delcmds", "delcomandos", "cmdclean"],
  descriptionKey: "commands.cmddelete.description",
  usageKey: "commands.cmddelete.usage",
  cooldown: 5000,
  minRole: "bouncer",

  async execute(ctx) {
    const { bot, args, reply, t } = ctx;
    const action = String(args[0] ?? "").toLowerCase();
    let enabled = Boolean(bot.cfg.deleteCommandMessagesEnabled);

    if (["on", "true", "1", "enable", "enabled"].includes(action)) {
      enabled = true;
    } else if (["off", "false", "0", "disable", "disabled"].includes(action)) {
      enabled = false;
    } else {
      enabled = !enabled;
    }

    bot.updateConfig("deleteCommandMessagesEnabled", enabled);
    await setSetting("deleteCommandMessagesEnabled", enabled);
    await reply(
      t(enabled ? "commands.cmddelete.enabled" : "commands.cmddelete.disabled"),
    );
  },
};
