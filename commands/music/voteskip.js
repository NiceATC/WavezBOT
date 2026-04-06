import { getRoleLevel } from "../../lib/permissions.js";

function getTrackKey(bot) {
  const id = bot.getCurrentTrackId();
  if (id) return id;
  const current = bot.getSessionState().currentTrack;
  return current?.title ?? null;
}

function getVoteThreshold(bot) {
  const threshold = Math.max(
    0,
    Math.min(1, Number(bot.cfg.voteSkipThreshold) || 0),
  );
  const windowMs = Math.max(0, Number(bot.cfg.voteSkipActiveWindowMs) || 0);
  const active = Math.max(1, bot.getActiveUserCount(windowMs));
  const needed = Math.max(1, Math.ceil(active * threshold));
  return { active, needed };
}

function resetState(bot) {
  if (bot._voteSkipState?.timeoutId) {
    clearTimeout(bot._voteSkipState.timeoutId);
  }
  bot._voteSkipState = null;
}

export default {
  name: "voteskip",
  aliases: ["skipvote"],
  descriptionKey: "commands.voteskip.description",
  usageKey: "commands.voteskip.usage",
  cooldown: 3000,

  async execute(ctx) {
    const { bot, sender, reply, t } = ctx;
    if (!bot.cfg.voteSkipEnabled) {
      await reply(t("commands.voteskip.disabled"));
      return;
    }

    const userId = sender.userId;
    if (userId == null) {
      await reply(t("commands.voteskip.noUser"));
      return;
    }

    const trackKey = getTrackKey(bot);
    if (!trackKey) {
      await reply(t("commands.voteskip.noTrack"));
      return;
    }

    const now = Date.now();
    const durationMs = Math.max(
      10_000,
      Number(bot.cfg.voteSkipDurationMs) || 60_000,
    );

    if (bot._voteSkipState && bot._voteSkipState.trackKey !== trackKey) {
      resetState(bot);
    }

    if (!bot._voteSkipState) {
      bot._voteSkipState = {
        trackKey,
        startedAt: now,
        votes: new Set(),
        expiresAt: now + durationMs,
        timeoutId: setTimeout(() => {
          if (bot._voteSkipState?.trackKey === trackKey) {
            bot.sendChat(bot.t("commands.voteskip.expired")).catch(() => {});
            resetState(bot);
          }
        }, durationMs),
      };
    }

    const state = bot._voteSkipState;
    if (state.votes.has(String(userId))) {
      await reply(t("commands.voteskip.alreadyVoted"));
      return;
    }

    state.votes.add(String(userId));

    const { active, needed } = getVoteThreshold(bot);
    const currentVotes = state.votes.size;

    if (currentVotes >= needed) {
      if (bot.getBotRoleLevel() < getRoleLevel("bouncer")) {
        await reply(t("commands.voteskip.noPermission"));
        resetState(bot);
        return;
      }

      const skipped = await bot.safeSkip({
        message: t("commands.voteskip.passed"),
      });
      if (!skipped) {
        await reply(t("commands.voteskip.failed"));
      }
      resetState(bot);
      return;
    }

    if (currentVotes === 1) {
      await reply(
        t("commands.voteskip.started", {
          votes: currentVotes,
          needed,
          active,
          seconds: Math.ceil(durationMs / 1000),
        }),
      );
      return;
    }

    await reply(
      t("commands.voteskip.voted", {
        votes: currentVotes,
        needed,
        active,
      }),
    );
  },
};
