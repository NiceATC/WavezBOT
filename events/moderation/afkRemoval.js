/**
 * events/afkRemoval.js
 *
 * Removes AFK users from the waitlist when enabled.
 */

import { Events } from "../../lib/wavez-events.js";
import { getRoleLevel } from "../../lib/permissions.js";
import { formatDuration } from "../../helpers/time.js";

const DEFAULT_LIMIT_MIN = 60;
const MAX_REMOVALS_PER_RUN = 2;

export default {
  name: "afkRemoval",
  descriptionKey: "events.afkRemoval.description",
  events: [Events.ROOM_WAITLIST_UPDATE, Events.ROOM_DJ_ADVANCE],
  cooldown: 20_000,

  async handle(ctx, data) {
    const { bot, api, reply, t } = ctx;
    if (bot.isPaused?.() && bot.isPaused()) return;
    if (!bot.cfg.afkRemovalEnabled) return;

    const limitMin = Number(bot.cfg.afkLimitMin ?? DEFAULT_LIMIT_MIN);
    if (!Number.isFinite(limitMin) || limitMin <= 0) return;

    if (bot.getBotRoleLevel() < getRoleLevel("bouncer")) return;

    let waitlist = data?.waitlist ?? data?.queue ?? null;
    if (!Array.isArray(waitlist)) {
      const res = await api.room.getWaitlist(bot.cfg.room);
      waitlist = res?.data?.data?.waitlist ?? res?.data?.waitlist ?? [];
    }
    if (!Array.isArray(waitlist) || waitlist.length === 0) return;

    const now = Date.now();
    const limitMs = limitMin * 60 * 1000;
    let removed = 0;

    for (const entry of waitlist) {
      if (removed >= MAX_REMOVALS_PER_RUN) break;

      const userId = entry.id ?? entry.userId ?? entry.user_id;
      if (userId == null) continue;
      if (bot.isBotUser(userId)) continue;

      if (bot.getUserRoleLevel(userId) >= getRoleLevel("bouncer")) continue;

      const lastAt = bot.getLastActivityAt(userId);
      if (!lastAt) continue;

      const idleMs = now - lastAt;
      if (idleMs < limitMs) continue;

      const name =
        entry.displayName ??
        entry.display_name ??
        entry.username ??
        bot.getRoomUserDisplayName(userId) ??
        t("common.someone");

      try {
        await api.room.removeFromWaitlist(bot.cfg.room, Number(userId));
        removed++;
        await reply(
          t("events.afkRemoval.removed", {
            user: name,
            duration: formatDuration(idleMs),
            minutes: Math.floor(idleMs / 60000),
          }),
        );
      } catch (err) {
        bot._log(
          "warn",
          t("events.afkRemoval.removeError", {
            user: name,
            error: err.message,
          }),
        );
      }
    }
  },
};
