/**
 * commands/mod/ban.js
 */

import { extractDurationAndReason } from "../../helpers/duration.js";

function isBotTarget(bot, user) {
  return bot?.isBotUser?.(user?.userId) ?? false;
}

function isBotName(bot, target) {
  const lower = String(target ?? "").toLowerCase();
  const names = [bot?._username, bot?._displayName].filter(Boolean);
  return names.some((name) => name.toLowerCase() === lower);
}

const ban = {
  name: "ban",
  aliases: ["banir"],
  descriptionKey: "commands.ban.description",
  usageKey: "commands.ban.usage",
  cooldown: 5_000,
  minRole: "manager",

  async execute(ctx) {
    const { api, bot, args, reply, t } = ctx;
    const target = (args[0] ?? "").replace(/^@/, "").trim();
    if (!target) {
      await reply(t("commands.ban.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(target);
    if (!user) {
      await reply(t("commands.ban.userNotFound", { user: target }));
      return;
    }

    if (isBotTarget(bot, user)) {
      await reply(t("commands.mod.cannotTargetBot"));
      return;
    }

    if (bot.getUserRoleLevel(user.userId) >= bot.getBotRoleLevel()) {
      await reply(
        t("commands.ban.roleTooHigh", {
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
      await api.room.ban(bot.cfg.room, user.userId, data);
      const parts = [
        t("commands.ban.banned", {
          user: user.displayName ?? user.username,
        }),
      ];
      if (label) parts.push(t("commands.ban.duration", { duration: label }));
      if (reason) parts.push(t("commands.ban.reason", { reason }));
      await reply(parts.join(" ") + ".");
    } catch (err) {
      await reply(t("commands.ban.error", { error: err.message }));
    }
  },
};

const unban = {
  name: "unban",
  aliases: ["desbanir"],
  descriptionKey: "commands.unban.description",
  usageKey: "commands.unban.usage",
  cooldown: 5_000,
  minRole: "manager",

  async execute(ctx) {
    const { api, bot, args, reply, t } = ctx;
    const target = (args[0] ?? "").replace(/^@/, "").trim();
    if (!target) {
      await reply(t("commands.unban.usageMessage"));
      return;
    }

    // The banned user won't be in the room; try local cache first, then fetch bans.
    let userId = bot.findRoomUser(target)?.userId ?? null;

    if (userId && isBotTarget(bot, { userId })) {
      await reply(t("commands.mod.cannotTargetBot"));
      return;
    }

    if (!userId && isBotName(bot, target)) {
      await reply(t("commands.mod.cannotTargetBot"));
      return;
    }

    if (!userId) {
      try {
        const bansRes = await api.room.getBans(bot.cfg.room);
        const bans = bansRes?.data?.data ?? bansRes?.data ?? [];
        const lower = target.toLowerCase();
        const found = (Array.isArray(bans) ? bans : []).find(
          (b) =>
            (b.username ?? "").toLowerCase() === lower ||
            (b.displayName ?? b.display_name ?? "").toLowerCase() === lower,
        );
        if (found) {
          userId = String(found.userId ?? found.user_id ?? found.id ?? "");
        }
      } catch {
        // getBans failed — try anyway below; server will return an error if invalid
      }
    }

    if (!userId) {
      await reply(t("commands.unban.notFound", { user: target }));
      return;
    }

    try {
      await api.room.unban(bot.cfg.room, userId);
      await reply(t("commands.unban.removed", { user: target }));
    } catch (err) {
      await reply(t("commands.unban.error", { error: err.message }));
    }
  },
};

export default [ban, unban];
