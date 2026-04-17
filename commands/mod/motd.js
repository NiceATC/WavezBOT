/**
 * commands/motd.js
 *
 * !motd [mensagem|on|off|interval <n>]
 * !togglemotd
 */

import { setSetting } from "../../lib/storage.js";

const motd = {
  name: "motd",
  aliases: ["mensagem"],
  descriptionKey: "commands.music.motd.description",
  usageKey: "commands.music.motd.usage",
  cooldown: 5000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { bot, args, reply, t } = ctx;

    if (args.length === 0) {
      const enabled = Boolean(bot.cfg.motdEnabled);
      const interval = bot.cfg.motdInterval ?? 0;
      const msg = bot.cfg.motd ?? "";
      const state = enabled
        ? t("commands.music.motd.stateOn")
        : t("commands.music.motd.stateOff");
      await reply(
        t("commands.music.motd.status", {
          state,
          interval,
          message: msg,
        }),
      );
      return;
    }

    const sub = args[0].toLowerCase();
    if (sub === "on" || sub === "off") {
      const enabled = sub === "on";
      bot.updateConfig("motdEnabled", enabled);
      await setSetting("motdEnabled", enabled);
      await reply(
        t(enabled ? "commands.music.motd.enabled" : "commands.music.motd.disabled"),
      );
      return;
    }

    if (sub === "interval") {
      const n = Number(args[1]);
      if (!Number.isFinite(n) || n <= 0) {
        await reply(t("commands.music.motd.intervalUsage"));
        return;
      }
      bot.updateConfig("motdInterval", Math.floor(n));
      await setSetting("motdInterval", Math.floor(n));
      await reply(
        t("commands.music.motd.intervalUpdated", {
          interval: Math.floor(n),
        }),
      );
      return;
    }

    const message = args.join(" ").trim();
    if (!message) {
      await reply(t("commands.music.motd.messageUsage"));
      return;
    }

    bot.updateConfig("motd", message);
    bot.updateConfig("motdEnabled", true);
    await setSetting("motd", message);
    await setSetting("motdEnabled", true);
    await reply(t("commands.music.motd.updated"));
  },
};

const togglemotd = {
  name: "togglemotd",
  aliases: ["motdtoggle"],
  descriptionKey: "commands.music.togglemotd.description",
  usageKey: "commands.music.togglemotd.usage",
  cooldown: 5000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { bot, args, reply, t } = ctx;
    const action = String(args[0] ?? "").toLowerCase();
    let enabled = Boolean(bot.cfg.motdEnabled);

    if (["on", "true", "1", "enable", "enabled"].includes(action)) {
      enabled = true;
    } else if (["off", "false", "0", "disable", "disabled"].includes(action)) {
      enabled = false;
    } else {
      enabled = !enabled;
    }

    bot.updateConfig("motdEnabled", enabled);
    await setSetting("motdEnabled", enabled);
    await reply(
      t(
        enabled
          ? "commands.music.togglemotd.enabled"
          : "commands.music.togglemotd.disabled",
      ),
    );
  },
};

export default [motd, togglemotd];
