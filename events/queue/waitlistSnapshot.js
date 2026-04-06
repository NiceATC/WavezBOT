/**
 * events/waitlistSnapshot.js
 *
 * Saves the current waitlist snapshot for DC restore.
 */

import { Events } from "../../lib/wavez-events.js";
import { upsertWaitlistSnapshot } from "../../lib/storage.js";

export default {
  name: "waitlistSnapshot",
  descriptionKey: "events.waitlistSnapshot.description",
  events: [
    Events.ROOM_WAITLIST_UPDATE,
    Events.ROOM_WAITLIST_JOIN,
    Events.ROOM_WAITLIST_LEAVE,
    Events.ROOM_DJ_ADVANCE,
  ],
  cooldown: 2000,

  async handle(ctx, data) {
    try {
      let waitlist = data?.waitlist ?? data?.queue ?? null;
      if (!Array.isArray(waitlist)) {
        const res = await ctx.api.room.getWaitlist(ctx.room);
        waitlist = res?.data?.data?.waitlist ?? res?.data?.waitlist ?? [];
      }
      if (!Array.isArray(waitlist) || waitlist.length === 0) return;

      const entries = waitlist.map((u, idx) => ({
        userId: u.id ?? u.userId ?? u.user_id,
        username: u.username ?? null,
        displayName: u.displayName ?? u.display_name ?? null,
        position: idx + 1,
      }));

      await upsertWaitlistSnapshot(entries);
    } catch {
      // best-effort
    }
  },
};
