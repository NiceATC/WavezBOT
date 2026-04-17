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
  descriptionKey: "commands.mod.ban.description",
  usageKey: "commands.mod.ban.usage",
  cooldown: 5_000,
  deleteOn: 60_000,
  minRole: "manager",

  async execute(ctx) {
    const { api, bot, args, reply, t, mention, mentionUser } = ctx;
    const target = (args[0] ?? "").trim();
    if (!target) {
      await reply(t("commands.mod.ban.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(target);
    if (!user) {
      await reply(
        t("commands.mod.ban.userNotFound", { user: mention(target) }),
      );
      return;
    }

    if (isBotTarget(bot, user)) {
      await reply(t("commands.mod.cannotTargetBot"));
      return;
    }

    if (bot.getUserRoleLevel(user.userId) >= bot.getBotRoleLevel()) {
      await reply(
        t("commands.mod.ban.roleTooHigh", {
          user: mentionUser(user, target),
        }),
      );
      return;
    }

    const { duration, label, reason } = extractDurationAndReason(args.slice(1));

    try {
      bot.wsBanUser(user.userId, { duration, reason });
      const parts = [
        t("commands.mod.ban.banned", {
          user: mentionUser(user, target),
        }),
      ];
      if (label)
        parts.push(t("commands.mod.ban.duration", { duration: label }));
      if (reason) parts.push(t("commands.mod.ban.reason", { reason }));
      await reply(parts.join(" ") + ".");
    } catch (err) {
      await reply(t("commands.mod.ban.error", { error: err.message }));
    }
  },
};

const unban = {
  name: "unban",
  aliases: ["desbanir"],
  descriptionKey: "commands.mod.unban.description",
  usageKey: "commands.mod.unban.usage",
  cooldown: 5_000,
  deleteOn: 60_000,
  minRole: "manager",

  async execute(ctx) {
    const { api, bot, args, reply, t, mention } = ctx;
    const target = (args[0] ?? "").trim();
    if (!target) {
      await reply(t("commands.mod.unban.usageMessage"));
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
        const bansRes = await api.room.getBans(bot.roomId);
        const bans =
          bansRes?.data?.data ?? bansRes?.data?.bans ?? bansRes?.data ?? [];
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
      await reply(t("commands.mod.unban.notFound", { user: mention(target) }));
      return;
    }

    try {
      await api.room.unban(bot.roomId, userId);
      await reply(t("commands.mod.unban.removed", { user: mention(target) }));
    } catch (err) {
      await reply(t("commands.mod.unban.error", { error: err.message }));
    }
  },
};

export default [ban, unban];
