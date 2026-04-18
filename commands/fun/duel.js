import { pickRandom } from "../../helpers/random.js";
import { getRoleLevel } from "../../lib/permissions.js";
import { setSetting } from "../../lib/storage.js";

const DUEL_TIMEOUT_MS = 60_000;
const DUEL_SUSPENSE_MS = 3500;
const DEFAULT_MUTE_MIN = 5;

const duelState = {
  current: null,
  timeoutId: null,
  resolveId: null,
  /** @type {string|null} ID da mensagem de desafio (para edição) */
  msgId: null,
};

function clearDuelState() {
  if (duelState.timeoutId) clearTimeout(duelState.timeoutId);
  if (duelState.resolveId) clearTimeout(duelState.resolveId);
  duelState.timeoutId = null;
  duelState.resolveId = null;
  duelState.current = null;
  duelState.msgId = null;
}

function formatName(user, fallback) {
  return user?.displayName ?? user?.username ?? fallback;
}

function toTag(name) {
  if (!name) return "";
  return name.startsWith("@") ? name : `@${name}`;
}

function fillVars(line, vars = {}) {
  if (!line) return "";
  let out = String(line);
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, String(value));
  }
  return out;
}

function pickLineWithFallback(bot, key, fallbackKey, vars = {}) {
  const lines = bot.tArray(key) ?? [];
  const chosen =
    lines.length > 0 ? pickRandom(lines) : bot.t(fallbackKey, vars);
  return fillVars(chosen, vars);
}

function getMuteMinutes(bot) {
  const raw = Number(bot?.cfg?.duelMuteMin ?? DEFAULT_MUTE_MIN);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_MUTE_MIN;
  return Math.floor(raw);
}

function getMessageIdFromResponse(res) {
  const msg =
    res?.data?.data?.message ??
    res?.data?.message ??
    res?.data?.data ??
    res?.data ??
    null;
  return (
    msg?.id ??
    msg?.messageId ??
    msg?.message_id ??
    res?.data?.messageId ??
    res?.data?.message_id ??
    null
  );
}

async function updateDuelMessage(bot, content) {
  const res = duelState.msgId
    ? await bot.editChat(duelState.msgId, content)
    : await bot.sendChat(content);

  const nextId = getMessageIdFromResponse(res);
  if (nextId) duelState.msgId = String(nextId);
  return res;
}

async function resolveDuel(bot, pending) {
  try {
    const challenger = {
      id: pending.challengerId,
      name: pending.challengerName,
    };
    const target = {
      id: pending.targetId,
      name: pending.targetName,
    };

    const roll = Math.random() < 0.5;
    const winner = roll ? challenger : target;
    const loser = roll ? target : challenger;

    const winnerTag = toTag(winner.name);
    const loserTag = toTag(loser.name);

    const minutes = getMuteMinutes(bot);
    const resultLine = pickLineWithFallback(
      bot,
      "commands.fun.duel.resultLines",
      "commands.fun.duel.result",
      { winner: winnerTag, loser: loserTag },
    );
    const muteLine = bot.t("commands.fun.duel.deleteMessagesFallback", {
      user: loserTag,
      minutes,
    });
    const finalMsg = [resultLine, muteLine].filter(Boolean).join(" | ");

    await updateDuelMessage(bot, finalMsg);

    bot.startDuelMute(loser.id, minutes * 60_000);

    setTimeout(() => {
      bot
        .sendChat(bot.t("commands.fun.duel.silenceExpired", { user: loserTag }))
        .catch(() => {});
    }, minutes * 60_000);
  } finally {
    clearDuelState();
  }
}

const duel = {
  name: "duel",
  aliases: ["duelo"],
  descriptionKey: "commands.fun.duel.description",
  usageKey: "commands.fun.duel.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, args, sender, reply, t, mention } = ctx;
    const targetInput = (args[0] ?? "").trim();
    if (!targetInput) {
      await reply(t("commands.fun.duel.usageMessage"));
      return;
    }

    const target = bot.findRoomUser(targetInput);
    if (!target) {
      await reply(
        t("commands.fun.duel.userNotFound", { user: mention(targetInput) }),
      );
      return;
    }

    if (bot.isBotUser(target.userId)) {
      await reply(t("commands.fun.duel.cannotTargetBot"));
      return;
    }

    if (bot.hasPlatformRole(target.userId)) {
      await reply(
        t("commands.mod.cannotTargetPlatformRole", {
          user: toTag(formatName(target, targetInput)),
        }),
      );
      return;
    }

    if (String(target.userId) === String(sender.userId ?? "")) {
      await reply(t("commands.fun.duel.self"));
      return;
    }

    if (duelState.current) {
      const seconds = Math.max(
        0,
        Math.ceil((duelState.current.expiresAt - Date.now()) / 1000),
      );
      await reply(
        t("commands.fun.duel.alreadyPending", {
          challenger: toTag(duelState.current.challengerName),
          target: toTag(duelState.current.targetName),
          seconds,
        }),
      );
      return;
    }

    const challengerName = formatName(sender, t("common.someone"));
    const targetName = formatName(target, targetInput);

    const pending = {
      status: "pending",
      challengerId: String(sender.userId ?? ""),
      challengerName,
      targetId: String(target.userId ?? ""),
      targetName,
      createdAt: Date.now(),
      expiresAt: Date.now() + DUEL_TIMEOUT_MS,
    };

    duelState.current = pending;
    duelState.timeoutId = setTimeout(() => {
      if (duelState.current !== pending) return;
      const line =
        pickRandom(bot.tArray("commands.fun.duel.cowardLines")) ?? "";
      const msg = [
        bot.t("commands.fun.duel.timeout", {
          target: toTag(pending.targetName),
        }),
        line,
      ]
        .filter(Boolean)
        .join(" ");
      updateDuelMessage(bot, msg).catch(() => {});
      clearDuelState();
    }, DUEL_TIMEOUT_MS);

    const vars = {
      challenger: toTag(challengerName),
      target: toTag(targetName),
      accept: "!accept",
      recuse: "!recuse",
    };
    await updateDuelMessage(
      bot,
      pickLineWithFallback(
        bot,
        "commands.fun.duel.challengeLines",
        "commands.fun.duel.challenge",
        vars,
      ),
    );
  },
};

const accept = {
  name: "accept",
  descriptionKey: "commands.fun.accept.description",
  usageKey: "commands.fun.accept.usage",
  cooldown: 3000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, sender, reply, t } = ctx;
    const pending = duelState.current;

    if (!pending) {
      await reply(t("commands.fun.duel.noPending"));
      return;
    }

    if (pending.status !== "pending") {
      await reply(t("commands.fun.duel.alreadyAccepted"));
      return;
    }

    if (String(sender.userId ?? "") !== String(pending.targetId)) {
      await reply(t("commands.fun.duel.notTarget"));
      return;
    }

    if (pending.expiresAt && Date.now() > pending.expiresAt) {
      clearDuelState();
      await reply(t("commands.fun.duel.expired"));
      return;
    }

    if (bot.getBotRoleLevel() < getRoleLevel("bouncer")) {
      clearDuelState();
      await reply(t("commands.fun.duel.noPermission"));
      return;
    }

    pending.status = "accepted";
    if (duelState.timeoutId) clearTimeout(duelState.timeoutId);
    duelState.timeoutId = null;

    const acceptedLine = pickLineWithFallback(
      bot,
      "commands.fun.duel.acceptedLines",
      "commands.fun.duel.accepted",
      { target: toTag(pending.targetName) },
    );
    const suspense =
      pickRandom(bot.tArray("commands.fun.duel.suspenseLines")) ?? "";
    const acceptMsg = [acceptedLine, suspense].filter(Boolean).join(" ");
    await updateDuelMessage(bot, acceptMsg);

    duelState.resolveId = setTimeout(() => {
      resolveDuel(bot, pending).catch(() => {});
    }, DUEL_SUSPENSE_MS);
  },
};

const recuse = {
  name: "recuse",
  aliases: ["recusar"],
  descriptionKey: "commands.fun.recuse.description",
  usageKey: "commands.fun.recuse.usage",
  cooldown: 3000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, sender, reply, t } = ctx;
    const pending = duelState.current;

    if (!pending) {
      await reply(t("commands.fun.duel.noPending"));
      return;
    }

    if (pending.status !== "pending") {
      await reply(t("commands.fun.duel.alreadyAccepted"));
      return;
    }

    if (String(sender.userId ?? "") !== String(pending.targetId)) {
      await reply(t("commands.fun.duel.notTarget"));
      return;
    }

    const base = pickLineWithFallback(
      bot,
      "commands.fun.duel.refusedLines",
      "commands.fun.duel.refused",
      {
        target: toTag(pending.targetName),
      },
    );
    const line = pickRandom(bot.tArray("commands.fun.duel.cowardLines")) ?? "";
    await updateDuelMessage(bot, [base, line].filter(Boolean).join(" "));
    clearDuelState();
  },
};

const duelmute = {
  name: "duelmute",
  aliases: ["duelm"],
  descriptionKey: "commands.mod.duelmute.description",
  usageKey: "commands.mod.duelmute.usage",
  cooldown: 5000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { bot, args, reply, t } = ctx;
    const minutes = Number(args[0]);
    if (!Number.isFinite(minutes) || minutes < 1) {
      await reply(t("commands.mod.duelmute.usageMessage"));
      return;
    }

    const value = Math.floor(minutes);
    bot.updateConfig("duelMuteMin", value);
    await setSetting("duelMuteMin", value);
    await reply(t("commands.mod.duelmute.updated", { minutes: value }));
  },
};

const clearduel = {
  name: "clearduel",
  aliases: ["duelclear"],
  descriptionKey: "commands.mod.clearduel.description",
  usageKey: "commands.mod.clearduel.usage",
  cooldown: 5_000,
  deleteOn: 60_000,
  minRole: "cohost",

  async execute(ctx) {
    const { bot, args, reply, t, mention, mentionUser } = ctx;
    const target = (args[0] ?? "").trim();

    if (target) {
      const user = bot.findRoomUser(target);
      if (!user) {
        await reply(
          t("commands.mod.clearduel.userNotFound", { user: mention(target) }),
        );
        return;
      }
      const removed = bot.clearDuelMute(user.userId);
      if (!removed) {
        await reply(
          t("commands.mod.clearduel.notMuted", {
            user: mentionUser(user, target),
          }),
        );
        return;
      }
      await reply(
        t("commands.mod.clearduel.cleared", {
          user: mentionUser(user, target),
        }),
      );
    } else {
      bot.clearAllDuelMutes();
      await reply(t("commands.mod.clearduel.clearedAll"));
    }
  },
};

export default [duel, accept, recuse, duelmute, clearduel];
