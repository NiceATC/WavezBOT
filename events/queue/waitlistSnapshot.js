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
  // room_state_snapshot is sent on every track advance (and user join/leave).
  // queue_reordered fires when the queue order changes.
  events: [Events.ROOM_STATE_SNAPSHOT, Events.ROOM_QUEUE_REORDERED],
  cooldown: 2000,

  async handle(ctx) {
    try {
      const res = await ctx.api.room.getQueueStatus(ctx.room);
      const queue = res?.data ?? {};
      const entries = queue.entries ?? [];

      if (entries.length === 0) {
        await upsertWaitlistSnapshot([]);
        return;
      }

      const rows = entries
        .filter((e) => !e.isCurrentDj)
        .map((e) => ({
          userId: e.publicId ?? e.internalId ?? null,
          username: e.username ?? null,
          displayName: e.displayName ?? e.username ?? null,
          position: e.position ?? e.index + 1,
        }))
        .filter((e) => e.userId != null);

      await upsertWaitlistSnapshot(rows);
    } catch (err) {
      ctx.bot._log("warn", `[waitlistSnapshot] ${err.message}`);
    }
  },
};
