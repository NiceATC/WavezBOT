/**
 * commands/welcome.js
 *
 * !welcome - alterna a saudacao de entrada
 */

import { setSetting } from "../../lib/storage.js";

export default {
  name: "welcome",
  aliases: ["greet", "boasvindas"],
  descriptionKey: "commands.welcome.description",
  usageKey: "commands.welcome.usage",
  cooldown: 5000,
  minRole: "bouncer",

  async execute(ctx) {
    const { bot, args, reply, t } = ctx;
    const action = String(args[0] ?? "").toLowerCase();
    let enabled = Boolean(bot.cfg.greetEnabled);

    if (["on", "true", "1", "enable", "enabled"].includes(action)) {
      enabled = true;
    } else if (["off", "false", "0", "disable", "disabled"].includes(action)) {
      enabled = false;
    } else {
      enabled = !enabled;
    }

    bot.updateConfig("greetEnabled", enabled);
    await setSetting("greetEnabled", enabled);
    await reply(
      t(enabled ? "commands.welcome.enabled" : "commands.welcome.disabled"),
    );
  },
};
