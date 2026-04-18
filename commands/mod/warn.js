import {
  clearWarningsForUser,
  getWarningsForUser,
  issueWarning,
} from "../../helpers/warnings.js";

function resolveTarget(bot, raw) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  return bot.findRoomUser(value);
}

const warn = {
  name: "warn",
  descriptionKey: "commands.mod.warn.description",
  usageKey: "commands.mod.warn.usage",
  cooldown: 5000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { bot, args, reply, t, mention, mentionUser, sender } = ctx;
    const targetInput = String(args[0] ?? "").trim();
    if (!targetInput) {
      await reply(t("commands.mod.warn.usageMessage"));
      return;
    }

    const target = resolveTarget(bot, targetInput);
    if (!target) {
      await reply(
        t("commands.mod.warn.userNotFound", {
          user: mention(targetInput),
        }),
      );
      return;
    }

    if (bot.isBotUser(target.userId)) {
      await reply(t("commands.mod.cannotTargetBot"));
      return;
    }

    if (bot.hasPlatformRole(target.userId)) {
      await reply(
        t("commands.mod.cannotTargetPlatformRole", {
          user: mentionUser(target, targetInput),
        }),
      );
      return;
    }

    if (bot.getUserRoleLevel(target.userId) >= bot.getBotRoleLevel()) {
      await reply(
        t("commands.mod.warn.roleTooHigh", {
          user: mentionUser(target, targetInput),
        }),
      );
      return;
    }

    const reason = String(
      args.slice(1).join(" ").trim() || t("commands.mod.warn.defaultReason"),
    );

    const out = await issueWarning(bot, {
      userId: target.userId,
      moderatorUserId: sender?.userId ?? null,
      reason,
      source: "manual",
      banReason: `3 warns ativos - auto ban`,
    });

    if (!out.ok) {
      await reply(t("commands.mod.warn.error"));
      return;
    }

    if (out.banned) {
      await reply(
        t("commands.mod.warn.banned", {
          user: mentionUser(target, targetInput),
          count: out.count,
          threshold: out.threshold,
        }),
      );
      return;
    }

    if (out.banBlockedByPlatformRole) {
      await reply(
        t("commands.mod.warn.banBlockedPlatformRole", {
          user: mentionUser(target, targetInput),
          count: out.count,
          threshold: out.threshold,
        }),
      );
      return;
    }

    await reply(
      t("commands.mod.warn.added", {
        user: mentionUser(target, targetInput),
        reason,
        count: out.count,
        threshold: out.threshold,
      }),
    );
  },
};

const warnings = {
  name: "warnings",
  aliases: ["warns"],
  descriptionKey: "commands.mod.warnings.description",
  usageKey: "commands.mod.warnings.usage",
  cooldown: 4000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { bot, args, reply, t, mention, mentionUser, sender } = ctx;
    const targetInput = String(args[0] ?? "").trim();

    let userId = sender?.userId != null ? String(sender.userId) : "";
    let label = t("common.you");

    if (targetInput) {
      const target = resolveTarget(bot, targetInput);
      if (!target) {
        await reply(
          t("commands.mod.warnings.userNotFound", {
            user: mention(targetInput),
          }),
        );
        return;
      }
      userId = String(target.userId);
      label = mentionUser(target, targetInput);
    }

    if (!userId) {
      await reply(t("commands.mod.warnings.noUser"));
      return;
    }

    const rows = await getWarningsForUser(userId, { includeExpired: false });
    if (!rows.length) {
      await reply(t("commands.mod.warnings.empty", { user: label }));
      return;
    }

    const limit = Math.min(5, rows.length);
    const lines = rows.slice(0, limit).map((row, idx) => {
      const reason = String(row.reason ?? t("commands.mod.warn.defaultReason"));
      return `#${idx + 1} ${reason}`;
    });

    await reply(
      t("commands.mod.warnings.list", {
        user: label,
        count: rows.length,
        lines: lines.join(" | "),
      }),
    );
  },
};

const clearwarn = {
  name: "clearwarn",
  aliases: ["clearwarnings"],
  descriptionKey: "commands.mod.clearwarn.description",
  usageKey: "commands.mod.clearwarn.usage",
  cooldown: 5000,
  deleteOn: 60_000,
  minRole: "manager",

  async execute(ctx) {
    const { bot, args, reply, t, mention, mentionUser } = ctx;
    const targetInput = String(args[0] ?? "").trim();
    if (!targetInput) {
      await reply(t("commands.mod.clearwarn.usageMessage"));
      return;
    }

    const target = resolveTarget(bot, targetInput);
    if (!target) {
      await reply(
        t("commands.mod.clearwarn.userNotFound", {
          user: mention(targetInput),
        }),
      );
      return;
    }

    if (bot.hasPlatformRole(target.userId)) {
      await reply(
        t("commands.mod.cannotTargetPlatformRole", {
          user: mentionUser(target, targetInput),
        }),
      );
      return;
    }

    await clearWarningsForUser(target.userId);
    await reply(
      t("commands.mod.clearwarn.cleared", {
        user: mentionUser(target, targetInput),
      }),
    );
  },
};

export default [warn, warnings, clearwarn];
