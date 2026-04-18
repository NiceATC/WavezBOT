import { Events } from "../../lib/wavez-events.js";

// Spam escalation states per user: 0=none, 1=warned, 2=kicked
const SPAM_STATE_NONE = 0;
const SPAM_STATE_WARNED = 1;
const SPAM_STATE_KICKED = 2;

const state = {
  byUser: new Map(),
  lastActionAt: new Map(),
  spamState: new Map(), // uid → SPAM_STATE_*
};

/** Reset spam escalation when user rejoins */
export function resetAntiSpamKick(userId) {
  state.spamState.delete(String(userId));
}

function normalize(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jaccardWords(a, b) {
  const sa = new Set(normalize(a).split(" ").filter(Boolean));
  const sb = new Set(normalize(b).split(" ").filter(Boolean));
  if (!sa.size && !sb.size) return 1;
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const token of sa) {
    if (sb.has(token)) inter += 1;
  }
  const uni = new Set([...sa, ...sb]).size;
  return uni ? inter / uni : 0;
}

function prune(arr, cutoff) {
  return arr.filter((item) => item.at >= cutoff);
}

const antiSpam = {
  name: "antiSpam",
  descriptionKey: "events.antiSpam.description",
  event: Events.ROOM_CHAT_MESSAGE,

  async handle(ctx, data) {
    const { bot, t } = ctx;
    if (!bot.cfg.antiSpamEnabled) return;

    const sender = data?.sender ?? {};
    const userId = sender.userId ?? data?.userId ?? data?.user_id ?? null;
    if (userId == null) return;
    if (bot.isBotUser(userId)) return;

    const uid = String(userId);
    if (bot.getUserRoleLevel(uid) >= bot.getBotRoleLevel()) return;

    const content = String(data?.message ?? data?.content ?? "").trim();
    if (!content) return;

    const prefix = String(bot.cfg.cmdPrefix ?? "!");
    if (prefix && content.startsWith(prefix)) return;

    const now = Date.now();
    const windowMs = Math.max(1000, Number(bot.cfg.antiSpamWindowMs ?? 15_000));
    const similarityThreshold = Math.max(
      0.5,
      Math.min(1, Number(bot.cfg.antiSpamSimilarityThreshold ?? 0.9)),
    );
    const minRepeats = Math.max(2, Number(bot.cfg.antiSpamMinRepeats ?? 3));
    const warnCooldownMs = Math.max(
      1000,
      Number(bot.cfg.antiSpamWarnCooldownMs ?? 60_000),
    );

    const old = state.byUser.get(uid) ?? [];
    const recent = prune(old, now - windowMs);
    const msgId = data?.id ?? data?.messageId ?? data?.message_id ?? null;
    recent.push({ text: content, at: now, msgId });
    state.byUser.set(uid, recent);

    const targetNorm = normalize(content);
    if (!targetNorm) return;

    let similarCount = 0;
    for (const item of recent) {
      const itemNorm = normalize(item.text);
      if (!itemNorm) continue;
      if (itemNorm === targetNorm) {
        similarCount += 1;
        continue;
      }
      const score = jaccardWords(itemNorm, targetNorm);
      if (score >= similarityThreshold) similarCount += 1;
    }

    if (similarCount < minRepeats) return;

    const lastAction = Number(state.lastActionAt.get(uid) ?? 0);
    if (now - lastAction < warnCooldownMs) return;
    state.lastActionAt.set(uid, now);

    // Always delete spam messages
    if (bot.cfg.antiSpamDeleteMessages !== false) {
      const messageId = data?.id ?? data?.messageId ?? data?.message_id ?? null;
      if (messageId) {
        const delayMs = Number(bot.cfg.deleteCommandMessagesDelayMs ?? 0);
        bot.scheduleMessageDelete(messageId, delayMs);
      }
      for (const item of recent) {
        if (item.msgId && item.msgId !== messageId) {
          bot.scheduleMessageDelete(item.msgId, 200);
        }
      }
    }

    const currentState = state.spamState.get(uid) ?? SPAM_STATE_NONE;
    const userDisplayName = bot.getRoomUserDisplayName?.(uid) ?? uid;
    const userTag = userDisplayName.startsWith("@")
      ? userDisplayName
      : `@${userDisplayName}`;
    const canAct = bot.getBotRoleLevel() > bot.getUserRoleLevel(uid);

    if (currentState === SPAM_STATE_NONE) {
      // First detection: warn in chat only, delete messages
      state.spamState.set(uid, SPAM_STATE_WARNED);
      await bot.sendChat(t("events.antiSpam.chatWarned", { user: userTag }));
      return;
    }

    if (currentState === SPAM_STATE_WARNED) {
      // Second detection: kick
      state.spamState.set(uid, SPAM_STATE_KICKED);
      if (canAct) bot.wsKickUser(uid, { reason: t("events.antiSpam.reason") });
      await bot.sendChat(t("events.antiSpam.kicked", { user: userTag }));
      return;
    }

    // Third detection (returned after kick): ban directly
    state.spamState.delete(uid);
    if (canAct) {
      bot.wsBanUser(uid, { reason: t("events.antiSpam.banReason") });
    }
    await bot.sendChat(t("events.antiSpam.banned", { user: userTag }));
  },
};

const antiSpamJoinReset = {
  name: "antiSpamJoinReset",
  descriptionKey: "events.antiSpam.description",
  event: Events.ROOM_USER_JOIN,

  async handle(_ctx, data) {
    const userId = data?.userId ?? data?.user_id ?? data?.user?.userId ?? null;
    if (userId != null) resetAntiSpamKick(String(userId));
  },
};

export default [antiSpam, antiSpamJoinReset];
