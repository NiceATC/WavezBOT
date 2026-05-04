import {
  clearActiveGiveaway,
  drawWinners,
  formatCountdown,
  getActiveGiveaway,
  parseDurationMs,
  sendSplit,
  setActiveGiveaway,
} from "../../helpers/giveaway.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normalizeAction(input) {
  const raw = String(input ?? "")
    .trim()
    .toLowerCase();
  if (["cancelar", "cancel"].includes(raw)) return "cancel";
  if (["encerrar", "end", "finalizar"].includes(raw)) return "end";
  if (["reroll", "sortear", "novo"].includes(raw)) return "reroll";
  if (["status", "info", "estado"].includes(raw)) return "status";
  if (["lista", "list", "participantes"].includes(raw)) return "list";
  if (["join", "entrar", "participar"].includes(raw)) return "join";
  return "start";
}

/** Called when the giveaway timer fires or is manually ended. */
async function finishGiveaway(bot) {
  const giveaway = getActiveGiveaway();
  if (!giveaway || giveaway.ended) return;
  giveaway.ended = true;

  // Cancel any pending reminder timers
  for (const id of giveaway.reminderTimers ?? []) clearTimeout(id);
  giveaway.reminderTimers = [];

  const { prize, winners: winnerCount, participants } = giveaway;

  if (participants.size === 0) {
    clearActiveGiveaway();
    await sendSplit(
      (s) => bot.sendChat(s),
      bot.t("commands.fun.sorteio.noParticipants", { prize }),
    );
    return;
  }

  const drawn = drawWinners(participants, winnerCount);
  giveaway.lastWinners = drawn.map((w) => w.userId);

  const names = drawn.map((w) => `@${w.displayName}`).join(", ");
  clearActiveGiveaway();
  await sendSplit(
    (s) => bot.sendChat(s),
    bot.t("commands.fun.sorteio.winners", {
      prize,
      names,
      count: drawn.length,
    }),
  );
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

/**
 * Schedule periodic reminder messages during the giveaway.
 * Fires at 50% and 80% of total duration, skipping checkpoints
 * that fall within 15s of start or end.
 */
function scheduleReminders(bot, durationMs) {
  const MIN_GAP_MS = 15_000;
  const checkpoints = [0.5, 0.8];
  const timers = [];
  for (const pct of checkpoints) {
    const delay = Math.round(durationMs * pct);
    if (delay < MIN_GAP_MS || durationMs - delay < MIN_GAP_MS) continue;
    const id = setTimeout(async () => {
      const g = getActiveGiveaway();
      if (!g || g.ended) return;
      const remaining = formatCountdown(g.endsAt - Date.now());
      await bot.sendChat(
        bot.t("commands.fun.sorteio.reminder", {
          prize: g.prize,
          remaining,
          joinCmd: "!sorteio join",
          count: g.participants.size,
        }),
      );
    }, delay);
    timers.push(id);
  }
  return timers;
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export default {
  name: "sorteio",
  aliases: ["giveaway"],
  // minRole is checked per-action below (join is open to everyone)
  descriptionKey: "commands.fun.sorteio.description",
  usageKey: "commands.fun.sorteio.usage",
  cooldown: 2000,
  // deleteOn is intentionally omitted — giveaway messages must NOT be auto-deleted

  async execute(ctx) {
    const { args, reply, t, bot, senderRoleLevel } = ctx;
    const action = normalizeAction(args[0]);

    // Management actions require co-host+
    const COHOST_LEVEL = 80;
    const restricted = ["cancel", "end", "reroll", "start"];
    if (restricted.includes(action) && senderRoleLevel < COHOST_LEVEL) {
      await reply(
        t("commands.registry.userMissingRoleReply", {
          user: ctx.sender?.displayName ?? ctx.sender?.username ?? "",
          role: "co-host",
          command: "!sorteio",
        }),
      );
      return;
    }

    // -----------------------------------------------------------------------
    // cancel
    // -----------------------------------------------------------------------
    if (action === "cancel") {
      const giveaway = getActiveGiveaway();
      if (!giveaway) {
        await reply(t("commands.fun.sorteio.noneActive"));
        return;
      }
      const { prize } = giveaway;
      clearActiveGiveaway();
      await reply(t("commands.fun.sorteio.cancelled", { prize }));
      return;
    }

    // -----------------------------------------------------------------------
    // end early
    // -----------------------------------------------------------------------
    if (action === "end") {
      const giveaway = getActiveGiveaway();
      if (!giveaway) {
        await reply(t("commands.fun.sorteio.noneActive"));
        return;
      }
      if (giveaway.ended) {
        await reply(t("commands.fun.sorteio.alreadyEnded"));
        return;
      }
      clearTimeout(giveaway.timer);
      await finishGiveaway(bot);
      return;
    }

    // -----------------------------------------------------------------------
    // reroll
    // -----------------------------------------------------------------------
    if (action === "reroll") {
      const giveaway = getActiveGiveaway();
      // Allow reroll on the completed giveaway that was just cleared —
      // so we keep the last giveaway data in a separate slot.
      // Instead, we store lastGiveaway on the module level.
      if (!bot._lastGiveaway) {
        await reply(t("commands.fun.sorteio.noReroll"));
        return;
      }
      const { prize, winners: winnerCount, participants } = bot._lastGiveaway;
      if (participants.size === 0) {
        await reply(t("commands.fun.sorteio.noParticipants", { prize }));
        return;
      }
      const drawn = drawWinners(participants, winnerCount);
      bot._lastGiveaway.lastWinners = drawn.map((w) => w.userId);
      const names = drawn.map((w) => `@${w.displayName}`).join(", ");
      await sendSplit(
        (s) => bot.sendChat(s),
        t("commands.fun.sorteio.rerollWinners", {
          prize,
          names,
          count: drawn.length,
        }),
      );
      return;
    }

    // -----------------------------------------------------------------------
    // status
    // -----------------------------------------------------------------------
    if (action === "status") {
      const giveaway = getActiveGiveaway();
      if (!giveaway) {
        await reply(t("commands.fun.sorteio.noneActive"));
        return;
      }
      const remaining = formatCountdown(giveaway.endsAt - Date.now());
      await reply(
        t("commands.fun.sorteio.status", {
          prize: giveaway.prize,
          winners: giveaway.winners,
          participants: giveaway.participants.size,
          remaining,
        }),
      );
      return;
    }

    // -----------------------------------------------------------------------
    // join
    // -----------------------------------------------------------------------
    if (action === "join") {
      const giveaway = getActiveGiveaway();
      if (!giveaway) {
        await reply(t("commands.fun.sorteio.noneActive"));
        return;
      }
      if (giveaway.ended) {
        await reply(t("commands.fun.sorteio.alreadyEnded"));
        return;
      }
      const userId = ctx.sender?.userId;
      if (!userId) return;
      const displayName =
        ctx.sender?.displayName ?? ctx.sender?.username ?? userId;
      if (giveaway.participants.has(userId)) {
        await reply(
          t("commands.fun.sorteio.joinAlready", { name: displayName }),
        );
        return;
      }
      giveaway.participants.set(userId, displayName);
      await reply(
        t("commands.fun.sorteio.joined", {
          name: displayName,
          count: giveaway.participants.size,
          prize: giveaway.prize,
        }),
      );
      return;
    }

    // -----------------------------------------------------------------------
    // list participants
    // -----------------------------------------------------------------------
    if (action === "list") {
      const giveaway = getActiveGiveaway();
      if (!giveaway) {
        await reply(t("commands.fun.sorteio.noneActive"));
        return;
      }
      if (giveaway.participants.size === 0) {
        await reply(t("commands.fun.sorteio.listEmpty"));
        return;
      }
      const names = [...giveaway.participants.values()]
        .map((n) => `@${n}`)
        .join(", ");
      await sendSplit(
        (s) => bot.sendChat(s),
        t("commands.fun.sorteio.list", {
          count: giveaway.participants.size,
          names,
        }),
      );
      return;
    }

    // -----------------------------------------------------------------------
    // start
    // -----------------------------------------------------------------------
    if (getActiveGiveaway()) {
      await reply(t("commands.fun.sorteio.alreadyActive"));
      return;
    }

    // Parse: !sorteio <tempo> <ganhadores> <premio...> [imagemUrl]
    // tempo  = args[0], ganhadores = args[1], prize = rest (URL stripped if present)
    const timeRaw = args[0];
    const winnersRaw = args[1];
    const restArgs = args.slice(2);

    const durationMs = parseDurationMs(timeRaw);
    if (!durationMs) {
      await reply(
        t("commands.fun.sorteio.usage") +
          " — " +
          t("commands.fun.sorteio.invalidTime"),
      );
      return;
    }

    const winnerCount = parseInt(winnersRaw, 10);
    if (!winnerCount || winnerCount < 1 || winnerCount > 20) {
      await reply(t("commands.fun.sorteio.invalidWinners"));
      return;
    }

    if (restArgs.length === 0) {
      await reply(t("commands.fun.sorteio.usage"));
      return;
    }

    // Detect optional image URL as the last argument
    let imageUrl = null;
    const lastArg = restArgs[restArgs.length - 1];
    if (/^https?:\/\//i.test(lastArg)) {
      imageUrl = lastArg;
      restArgs.pop();
    }

    const prize = restArgs.join(" ").trim();
    if (!prize) {
      await reply(t("commands.fun.sorteio.usage"));
      return;
    }

    const endsAt = Date.now() + durationMs;
    const timeLabel = formatCountdown(durationMs);

    const timer = setTimeout(() => finishGiveaway(bot), durationMs);
    const reminderTimers = scheduleReminders(bot, durationMs);

    const giveaway = {
      prize,
      winners: winnerCount,
      endsAt,
      imageUrl,
      participants: new Map(),
      lastWinners: [],
      timer,
      reminderTimers,
      ended: false,
    };

    setActiveGiveaway(giveaway);
    // Store reference for reroll after completion
    bot._lastGiveaway = giveaway;

    // Announce
    await sendSplit(
      (s) => bot.sendChat(s),
      t("commands.fun.sorteio.started", {
        prize,
        winners: winnerCount,
        time: timeLabel,
        joinCmd: "!sorteio join",
      }),
    );

    if (imageUrl) {
      await bot.sendChat(imageUrl);
    }
  },
};
