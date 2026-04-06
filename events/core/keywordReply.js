import { Events } from "../../lib/wavez-events.js";
import { pickRandom } from "../../helpers/random.js";

const DEFAULT_REPEAT_BLOCK_MS = 86_400_000;

let lastReplyAt = 0;
const userReplyHistory = new Map();

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function toMs(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function isExactMode(mode) {
  if (mode === 1 || mode === "1" || mode === true) return true;
  const normalized = String(mode ?? "")
    .trim()
    .toLowerCase();
  return normalized === "exact";
}

function getRuleKeywords(bot, rule) {
  const source =
    rule?.keywords ??
    rule?.keyword ??
    rule?.triggers ??
    rule?.trigger ??
    rule?.matches ??
    rule?.match ??
    null;

  if (source == null) return [];

  const localizedSource = bot.localizeValue(source);
  if (Array.isArray(localizedSource)) {
    return localizedSource
      .map((entry) => normalizeText(bot.localizeValue(entry)))
      .filter(Boolean);
  }

  const single = normalizeText(localizedSource);
  return single ? [single] : [];
}

function getRuleReplies(bot, rule) {
  const source =
    rule?.reply ??
    rule?.replies ??
    rule?.response ??
    rule?.responses ??
    rule?.message ??
    rule?.messages ??
    null;

  if (source == null) return [];

  const localizedSource = bot.localizeValue(source);
  if (Array.isArray(localizedSource)) {
    return localizedSource
      .map((entry) => String(bot.localizeValue(entry) ?? "").trim())
      .filter(Boolean);
  }

  const single = String(localizedSource ?? "").trim();
  return single ? [single] : [];
}

function applySenderTemplate(text, sender) {
  const displayName = sender?.displayName ?? sender?.username ?? "";
  const username = sender?.username ?? displayName;
  return String(text ?? "")
    .replace(/{name}/g, displayName)
    .replace(/{username}/g, username);
}

function getSenderId(sender, data) {
  const raw = sender?.userId ?? data?.userId ?? data?.user_id ?? null;
  const id = String(raw ?? "").trim();
  return id || null;
}

function hasRecentSameReply(userId, replyKey, now, windowMs) {
  if (!userId || !replyKey || windowMs <= 0) return false;
  const byReply = userReplyHistory.get(userId);
  if (!byReply) return false;

  const lastAt = Number(byReply.get(replyKey) ?? 0);
  const inWindow = now - lastAt < windowMs;
  if (inWindow) return true;

  if (lastAt > 0) {
    byReply.delete(replyKey);
    if (byReply.size === 0) userReplyHistory.delete(userId);
  }
  return false;
}

function rememberReply(userId, replyKey, now, windowMs) {
  if (!userId || !replyKey || windowMs <= 0) return;

  const byReply = userReplyHistory.get(userId) ?? new Map();
  byReply.set(replyKey, now);

  const pruneBefore = now - Math.max(windowMs, 60_000);
  for (const [key, stamp] of byReply.entries()) {
    if (Number(stamp) < pruneBefore) byReply.delete(key);
  }

  if (byReply.size === 0) userReplyHistory.delete(userId);
  else userReplyHistory.set(userId, byReply);
}

function pickReplyForUser({
  options,
  sender,
  senderId,
  now,
  sameReplyCooldownMs,
}) {
  const prepared = options
    .map((template) => {
      const output = applySenderTemplate(template, sender).trim();
      return {
        output,
        key: normalizeText(output),
      };
    })
    .filter((item) => item.output);

  if (prepared.length === 0) return null;

  if (!senderId || sameReplyCooldownMs <= 0) {
    if (prepared.length === 1) return prepared[0];
    return pickRandom(prepared) ?? prepared[0];
  }

  const available = prepared.filter(
    (item) => !hasRecentSameReply(senderId, item.key, now, sameReplyCooldownMs),
  );
  if (available.length === 0) return null;
  if (available.length === 1) return available[0];
  return pickRandom(available) ?? available[0];
}

export default {
  name: "keywordReply",
  descriptionKey: "events.keywordReply.description",
  event: Events.ROOM_CHAT_MESSAGE,

  async handle(ctx, data) {
    const { bot, reply } = ctx;
    if (!bot.cfg.chatKeywordReplyEnabled) return;

    const rules = Array.isArray(bot.cfg.chatKeywordReplyRules)
      ? bot.cfg.chatKeywordReplyRules
      : [];
    if (rules.length === 0) return;

    const messageRaw = String(data?.message ?? data?.content ?? "").trim();
    if (!messageRaw) return;

    const message = normalizeText(messageRaw);
    if (!message) return;

    const sender = data?.sender ?? {};
    const senderId = getSenderId(sender, data);

    for (const rule of rules) {
      if (!rule || typeof rule !== "object") continue;

      const keywords = getRuleKeywords(bot, rule);
      if (keywords.length === 0) continue;

      const matched = isExactMode(rule.mode)
        ? keywords.some((keyword) => message === keyword)
        : keywords.some((keyword) => message.includes(keyword));
      if (!matched) continue;

      const now = Date.now();
      const cooldownMs = toMs(
        rule?.cooldownMs ??
          rule?.cooldown ??
          bot.cfg.chatKeywordReplyCooldownMs,
        0,
      );
      if (cooldownMs > 0 && now - lastReplyAt < cooldownMs) return;

      const sameReplyCooldownMs = toMs(
        rule?.sameReplyCooldownMs ??
          bot.cfg.chatKeywordReplySameReplyCooldownMs,
        DEFAULT_REPEAT_BLOCK_MS,
      );

      const options = getRuleReplies(bot, rule);
      if (options.length === 0) continue;

      const selected = pickReplyForUser({
        options,
        sender,
        senderId,
        now,
        sameReplyCooldownMs,
      });
      if (!selected) continue;

      const replyRes = await reply(selected.output);
      const deleteMs = Number(bot.cfg.deleteCommandMessagesDelayMs);
      if (deleteMs > 0) {
        const sentMsg =
          replyRes?.data?.data?.message ?? replyRes?.data?.message ?? null;
        const sentId =
          sentMsg?.id ?? replyRes?.data?.data?.id ?? replyRes?.data?.id ?? null;
        if (sentId) bot.scheduleMessageDelete(sentId, deleteMs);
      }
      lastReplyAt = Date.now();
      rememberReply(senderId, selected.key, lastReplyAt, sameReplyCooldownMs);
      return;
    }
  },
};
