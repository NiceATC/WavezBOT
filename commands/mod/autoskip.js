import { setSetting } from "../../lib/storage.js";

export default {
  name: "autoskip",
  aliases: ["askip"],
  descriptionKey: "commands.mod.autoskip.description",
  usageKey: "commands.mod.autoskip.usage",
  cooldown: 5000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { bot, args, reply, t } = ctx;
    const action = String(args[0] ?? "").toLowerCase();
    let enabled = Boolean(bot.cfg.autoSkipEnabled);

    if (["on", "true", "1", "enable", "enabled"].includes(action)) {
      enabled = true;
    } else if (["off", "false", "0", "disable", "disabled"].includes(action)) {
      enabled = false;
    } else {
      enabled = !enabled;
    }

    bot.updateConfig("autoSkipEnabled", enabled);
    await setSetting("autoSkipEnabled", enabled);
    await reply(
      t(enabled ? "commands.mod.autoskip.enabled" : "commands.mod.autoskip.disabled"),
    );
  },
};
