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
};

function clearDuelState() {
  if (duelState.timeoutId) clearTimeout(duelState.timeoutId);
  if (duelState.resolveId) clearTimeout(duelState.resolveId);
  duelState.timeoutId = null;
  duelState.resolveId = null;
  duelState.current = null;
}

function formatName(user, fallback) {
  return user?.displayName ?? user?.username ?? fallback;
}

function toTag(name) {
  if (!name) return "";
  return name.startsWith("@") ? name : `@${name}`;
}

function getMuteMinutes(bot) {
  const raw = Number(bot?.cfg?.duelMuteMin ?? DEFAULT_MUTE_MIN);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_MUTE_MIN;
  return Math.floor(raw);
}

async function resolveDuel(bot, api, pending) {
  clearDuelState();

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

  await bot.sendChat(
    bot.t("commands.duel.result", {
      winner: winnerTag,
      loser: loserTag,
    }),
  );

  const minutes = getMuteMinutes(bot);

  if (!api?.room?.mute) {
    await bot.sendChat(bot.t("commands.duel.muteUnavailable"));
    bot.startAutoDeletingUser(loser.id, minutes * 60_000);
    await bot.sendChat(
      bot.t("commands.duel.deleteMessagesFallback", {
        user: loserTag,
        minutes,
      }),
    );
    return;
  }

  if (bot.getUserRoleLevel(loser.id) >= bot.getBotRoleLevel()) {
    await bot.sendChat(
      bot.t("commands.duel.muteRoleTooHigh", {
        user: loserTag,
      }),
    );
    bot.startAutoDeletingUser(loser.id, minutes * 60_000);
    await bot.sendChat(
      bot.t("commands.duel.deleteMessagesFallback", {
        user: loserTag,
        minutes,
      }),
    );
    return;
  }

  try {
    await api.room.mute(bot.cfg.room, Number(loser.id), {
      duration: minutes,
      reason: bot.t("commands.duel.muteReason"),
    });
    await bot.sendChat(
      bot.t("commands.duel.muted", {
        user: loserTag,
        minutes,
      }),
    );
  } catch (err) {
    await bot.sendChat(
      bot.t("commands.duel.muteFailed", {
        user: loserTag,
        error: err.message,
      }),
    );
    bot.startAutoDeletingUser(loser.id, minutes * 60_000);
    await bot.sendChat(
      bot.t("commands.duel.deleteMessagesFallback", {
        user: loserTag,
        minutes,
      }),
    );
  }
}

const duel = {
  name: "duel",
  aliases: ["duelo"],
  descriptionKey: "commands.duel.description",
  usageKey: "commands.duel.usage",
  cooldown: 5000,

  async execute(ctx) {
    const { bot, args, sender, reply, t } = ctx;
    const targetInput = (args[0] ?? "").replace(/^@/, "").trim();
    if (!targetInput) {
      await reply(t("commands.duel.usageMessage"));
      return;
    }

    const target = bot.findRoomUser(targetInput);
    if (!target) {
      await reply(t("commands.duel.userNotFound", { user: targetInput }));
      return;
    }

    if (bot.isBotUser(target.userId)) {
      await reply(t("commands.duel.cannotTargetBot"));
      return;
    }

    if (String(target.userId) === String(sender.userId ?? "")) {
      await reply(t("commands.duel.self"));
      return;
    }

    if (duelState.current) {
      const seconds = Math.max(
        0,
        Math.ceil((duelState.current.expiresAt - Date.now()) / 1000),
      );
      await reply(
        t("commands.duel.alreadyPending", {
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
      const line = pickRandom(bot.tArray("commands.duel.cowardLines")) ?? "";
      const msg = [
        bot.t("commands.duel.timeout", {
          target: toTag(pending.targetName),
        }),
        line,
      ]
        .filter(Boolean)
        .join(" ");
      bot.sendChat(msg).catch(() => {});
      clearDuelState();
    }, DUEL_TIMEOUT_MS);

    await reply(
      t("commands.duel.challenge", {
        challenger: toTag(challengerName),
        target: toTag(targetName),
        accept: "!accept",
        recuse: "!recuse",
      }),
    );
  },
};

const accept = {
  name: "accept",
  descriptionKey: "commands.accept.description",
  usageKey: "commands.accept.usage",
  cooldown: 3000,

  async execute(ctx) {
    const { bot, api, sender, reply, t } = ctx;
    const pending = duelState.current;

    if (!pending) {
      await reply(t("commands.duel.noPending"));
      return;
    }

    if (pending.status !== "pending") {
      await reply(t("commands.duel.alreadyAccepted"));
      return;
    }

    if (String(sender.userId ?? "") !== String(pending.targetId)) {
      await reply(t("commands.duel.notTarget"));
      return;
    }

    if (pending.expiresAt && Date.now() > pending.expiresAt) {
      clearDuelState();
      await reply(t("commands.duel.expired"));
      return;
    }

    if (bot.getBotRoleLevel() < getRoleLevel("bouncer")) {
      clearDuelState();
      await reply(t("commands.duel.noPermission"));
      return;
    }

    pending.status = "accepted";
    if (duelState.timeoutId) clearTimeout(duelState.timeoutId);
    duelState.timeoutId = null;

    await reply(
      t("commands.duel.accepted", {
        target: toTag(pending.targetName),
      }),
    );

    const suspense =
      pickRandom(bot.tArray("commands.duel.suspenseLines")) ?? "";
    if (suspense) await reply(suspense);

    duelState.resolveId = setTimeout(() => {
      resolveDuel(bot, api, pending).catch(() => {});
    }, DUEL_SUSPENSE_MS);
  },
};

const recuse = {
  name: "recuse",
  aliases: ["recusar"],
  descriptionKey: "commands.recuse.description",
  usageKey: "commands.recuse.usage",
  cooldown: 3000,

  async execute(ctx) {
    const { bot, sender, reply, t } = ctx;
    const pending = duelState.current;

    if (!pending) {
      await reply(t("commands.duel.noPending"));
      return;
    }

    if (pending.status !== "pending") {
      await reply(t("commands.duel.alreadyAccepted"));
      return;
    }

    if (String(sender.userId ?? "") !== String(pending.targetId)) {
      await reply(t("commands.duel.notTarget"));
      return;
    }

    clearDuelState();

    const line = pickRandom(bot.tArray("commands.duel.cowardLines")) ?? "";
    const msg = [
      t("commands.duel.refused", {
        target: toTag(pending.targetName),
      }),
      line,
    ]
      .filter(Boolean)
      .join(" ");
    await reply(msg);
  },
};

const duelmute = {
  name: "duelmute",
  aliases: ["duelm"],
  descriptionKey: "commands.duelmute.description",
  usageKey: "commands.duelmute.usage",
  cooldown: 5000,
  minRole: "bouncer",

  async execute(ctx) {
    const { bot, args, reply, t } = ctx;
    const minutes = Number(args[0]);
    if (!Number.isFinite(minutes) || minutes < 1) {
      await reply(t("commands.duelmute.usageMessage"));
      return;
    }

    const value = Math.floor(minutes);
    bot.updateConfig("duelMuteMin", value);
    await setSetting("duelMuteMin", value);
    await reply(t("commands.duelmute.updated", { minutes: value }));
  },
};

export default [duel, accept, recuse, duelmute];
