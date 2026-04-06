/**
 * commands/mod/lockchat.js
 *
 * Locks the chat so only staff (>= lockChatMinRole) can send messages.
 * All messages from non-staff are automatically deleted while active.
 *
 * Usage: !lockchat [on|off]
 */

import { setSetting } from "../../lib/storage.js";

const lockchat = {
  name: "lockchat",
  aliases: ["chatlock"],
  descriptionKey: "commands.mod.lockchat.description",
  usageKey: "commands.mod.lockchat.usage",
  cooldown: 3_000,
  deleteOn: 60_000,
  minRole: "manager",

  async execute(ctx) {
    const { bot, args, reply, t } = ctx;

    const input = (args[0] ?? "").toLowerCase();
    let enable;

    if (input === "on" || input === "1" || input === "true") {
      enable = true;
    } else if (input === "off" || input === "0" || input === "false") {
      enable = false;
    } else {
      // Toggle if no argument given
      enable = !bot.cfg.lockChatEnabled;
    }

    bot.updateConfig("lockChatEnabled", enable);
    await setSetting("lockChatEnabled", enable);

    if (enable) {
      await reply(
        t("commands.mod.lockchat.enabled", {
          role: bot.cfg.lockChatMinRole ?? "resident_dj",
        }),
      );
    } else {
      await reply(t("commands.mod.lockchat.disabled"));
    }
  },
};

export default lockchat;
