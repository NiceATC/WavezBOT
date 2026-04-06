/**
 * commands/mod/mute.js
 */

import { extractDurationAndReason } from "../../helpers/duration.js";

function isBotTarget(bot, user) {
  return bot?.isBotUser?.(user?.userId) ?? false;
}

const mute = {
  name: "mute",
  aliases: ["silenciar", "calar"],
  descriptionKey: "commands.mute.description",
  usageKey: "commands.mute.usage",
  cooldown: 5_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { api, bot, args, reply, t } = ctx;
    const target = (args[0] ?? "").replace(/^@/, "").trim();
    if (!target) {
      await reply(t("commands.mute.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(target);
    if (!user) {
      await reply(t("commands.mute.userNotFound", { user: target }));
      return;
    }

    if (isBotTarget(bot, user)) {
      await reply(t("commands.mod.cannotTargetBot"));
      return;
    }

    if (bot.getUserRoleLevel(user.userId) >= bot.getBotRoleLevel()) {
      await reply(
        t("commands.mute.roleTooHigh", {
          user: user.displayName ?? user.username,
        }),
      );
      return;
    }

    const { duration, label, reason } = extractDurationAndReason(args.slice(1));

    const data = {};
    if (duration != null) data.duration = duration;
    if (reason) data.reason = reason;

    try {
      await api.room.mute(bot.cfg.room, user.userId, data);
      const parts = [
        t("commands.mute.muted", {
          user: user.displayName ?? user.username,
        }),
      ];
      if (label) parts.push(t("commands.mute.duration", { duration: label }));
      if (reason) parts.push(t("commands.mute.reason", { reason }));
      await reply(parts.join(" ") + ".");
    } catch (err) {
      await reply(t("commands.mute.error", { error: err.message }));
    }
  },
};

const unmute = {
  name: "unmute",
  aliases: ["dessilenciar"],
  descriptionKey: "commands.unmute.description",
  usageKey: "commands.unmute.usage",
  cooldown: 5_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { api, bot, args, reply, t } = ctx;
    const target = (args[0] ?? "").replace(/^@/, "").trim();
    if (!target) {
      await reply(t("commands.unmute.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(target);
    if (!user) {
      await reply(t("commands.unmute.userNotFound", { user: target }));
      return;
    }

    if (isBotTarget(bot, user)) {
      await reply(t("commands.mod.cannotTargetBot"));
      return;
    }

    try {
      await api.room.unmute(bot.cfg.room, user.userId);
      await reply(
        t("commands.unmute.unmuted", {
          user: user.displayName ?? user.username,
        }),
      );
    } catch (err) {
      await reply(t("commands.unmute.error", { error: err.message }));
    }
  },
};

export default [mute, unmute];
