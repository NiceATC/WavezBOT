/**
 * events/greet.js
 *
 * Sends a configurable welcome message when a user joins the room.
 *
 * Configuration (via .env):
 *   GREET_ENABLED=true          — toggle on/off at startup
 *   GREET_MESSAGE=🎵 ...        — message template (supports {name} and {username})
 *   GREET_COOLDOWN_MS=3600000   — per-user cooldown in ms (default: 1 hour)
 *
 * The handler can also be toggled at runtime:
 *   bot.events.enable("greet")
 *   bot.events.disable("greet")
 *
 * Cooldown is managed by EventRegistry using cooldownScope: "user", so each
 * user has their own cooldown window — the bot won't greet the same person
 * again until the cooldown expires.
 */

import { Events } from "../../lib/wavez-events.js";
import { getGreetState, upsertGreetState } from "../../lib/storage.js";

export default {
  name: "greet",
  descriptionKey: "events.greet.description",
  enabled: true,

  event: Events.ROOM_USER_JOIN,

  /**
   * Cooldown value read dynamically from bot config so GREET_COOLDOWN_MS is
   * respected without restarting the process.
   * EventRegistry calls this with (ctx, data) before each dispatch.
   */
  cooldown: (ctx) => ctx.bot.cfg.greetCooldownMs,
  cooldownScope: "user",

  async handle(ctx, data) {
    const { bot, reply } = ctx;

    // Skip the bot itself
    const userId = String(data?.userId ?? data?.user_id ?? data?.id ?? "");
    if (!userId || userId === String(bot._userId)) return;

    const display =
      data?.displayName ?? data?.display_name ?? data?.username ?? null;
    const username = data?.username ?? display ?? null;

    if (!display) return;

    let greetedAt = 0;
    let greetedCount = 0;
    try {
      const state = await getGreetState(userId);
      greetedAt = Number(state?.greeted_at ?? state?.greetedAt ?? 0);
      greetedCount = Number(state?.greeted_count ?? state?.greetedCount ?? 0);
    } catch {
      greetedAt = 0;
      greetedCount = 0;
    }

    const cooldownMs = Number(bot.cfg.greetCooldownMs) || 0;
    if (greetedAt && cooldownMs > 0 && Date.now() - greetedAt < cooldownMs) {
      return;
    }

    const isReturning = greetedCount > 0;

    // Resolve template: prefer array (random pick), fall back to single string
    function resolveGreetTemplate(bot, isReturning, display, username) {
      const arrKey = isReturning ? "greetBackMessages" : "greetMessages";
      const singleKey = isReturning ? "greetBackMessage" : "greetMessage";

      let base;
      const arr = bot.cfg[arrKey];
      if (Array.isArray(arr) && arr.length > 0) {
        base = arr[Math.floor(Math.random() * arr.length)];
      } else {
        base = bot.cfg[singleKey];
      }

      const resolved = String(bot.localizeValue(base) ?? "");
      const template = resolved
        .replace(/{name}/g, display)
        .replace(/{username}/g, username ?? display)
        .trim();

      return template;
    }

    let template = resolveGreetTemplate(bot, isReturning, display, username);

    if (!template && isReturning) {
      template = resolveGreetTemplate(bot, false, display, username);
    }

    if (!template) return;

    const res = await reply(template);
    const sentMsg = res?.data?.data?.message ?? res?.data?.message ?? null;
    const sentId = sentMsg?.id ?? res?.data?.data?.id ?? res?.data?.id ?? null;
    const deleteMs = Number(bot.cfg.greetDeleteMs) || 0;
    if (sentId && deleteMs > 0) {
      bot.scheduleMessageDelete(sentId, deleteMs);
    }

    await upsertGreetState({
      userId,
      greetedAt: Date.now(),
      greetedCount: greetedCount + 1,
    });
  },
};
