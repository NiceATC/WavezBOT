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
  descriptionKey: "commands.mod.mute.description",
  usageKey: "commands.mod.mute.usage",
  cooldown: 5_000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { api, bot, args, reply, t } = ctx;
    const target = (args[0] ?? "").replace(/^@/, "").trim();
    if (!target) {
      await reply(t("commands.mod.mute.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(target);
    if (!user) {
      await reply(t("commands.mod.mute.userNotFound", { user: target }));
      return;
    }

    if (isBotTarget(bot, user)) {
      await reply(t("commands.mod.cannotTargetBot"));
      return;
    }

    if (bot.getUserRoleLevel(user.userId) >= bot.getBotRoleLevel()) {
      await reply(
        t("commands.mod.mute.roleTooHigh", {
          user: user.displayName ?? user.username,
        }),
      );
      return;
    }

    const { duration, label, reason } = extractDurationAndReason(args.slice(1));

    try {
      const durationMs = duration != null ? duration * 1000 : 0;
      bot.wsMuteUser(user.userId, durationMs);
      const parts = [
        t("commands.mod.mute.muted", {
          user: user.displayName ?? user.username,
        }),
      ];
      if (label) parts.push(t("commands.mod.mute.duration", { duration: label }));
      if (reason) parts.push(t("commands.mod.mute.reason", { reason }));
      await reply(parts.join(" ") + ".");
    } catch (err) {
      await reply(t("commands.mod.mute.error", { error: err.message }));
    }
  },
};

const unmute = {
  name: "unmute",
  aliases: ["dessilenciar"],
  descriptionKey: "commands.mod.unmute.description",
  usageKey: "commands.mod.unmute.usage",
  cooldown: 5_000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { api, bot, args, reply, t } = ctx;
    const target = (args[0] ?? "").replace(/^@/, "").trim();
    if (!target) {
      await reply(t("commands.mod.unmute.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(target);
    if (!user) {
      await reply(t("commands.mod.unmute.userNotFound", { user: target }));
      return;
    }

    if (isBotTarget(bot, user)) {
      await reply(t("commands.mod.cannotTargetBot"));
      return;
    }

    try {
      bot.wsUnmuteUser(user.userId);
      await reply(
        t("commands.mod.unmute.unmuted", {
          user: user.displayName ?? user.username,
        }),
      );
    } catch (err) {
      await reply(t("commands.mod.unmute.error", { error: err.message }));
    }
  },
};

export default [mute, unmute];
