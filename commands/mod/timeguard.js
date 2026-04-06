/**
 * commands/mod/timeguard.js
 */

import { setSetting } from "../../lib/storage.js";

const timeguard = {
  name: "timeguard",
  aliases: ["tg"],
  descriptionKey: "commands.mod.timeguard.description",
  usageKey: "commands.mod.timeguard.usage",
  cooldown: 5_000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { bot, args, reply, t } = ctx;
    const action = String(args[0] ?? "").toLowerCase();
    let enabled = Boolean(bot.cfg.timeGuardEnabled);

    if (["on", "true", "1", "enable", "enabled"].includes(action)) {
      enabled = true;
    } else if (["off", "false", "0", "disable", "disabled"].includes(action)) {
      enabled = false;
    } else {
      enabled = !enabled;
    }

    bot.updateConfig("timeGuardEnabled", enabled);
    await setSetting("timeGuardEnabled", enabled);
    await reply(
      t(enabled ? "commands.mod.timeguard.enabled" : "commands.mod.timeguard.disabled"),
    );
  },
};

const maxlength = {
  name: "maxlength",
  aliases: ["maxlen", "maxsong"],
  descriptionKey: "commands.mod.maxlength.description",
  usageKey: "commands.mod.maxlength.usage",
  cooldown: 5_000,
  deleteOn: 60_000,
  minRole: "manager",

  async execute(ctx) {
    const { bot, args, reply, t } = ctx;
    const minutes = Number(args[0]);
    if (!Number.isFinite(minutes) || minutes < 1) {
      await reply(t("commands.mod.maxlength.usageMessage"));
      return;
    }
    const value = Math.floor(minutes);
    bot.updateConfig("maxSongLengthMin", value);
    await setSetting("maxSongLengthMin", value);
    await reply(
      t("commands.mod.maxlength.updated", {
        minutes: value,
      }),
    );
  },
};

export default [timeguard, maxlength];
