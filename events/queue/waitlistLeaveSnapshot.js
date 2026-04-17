/**
 * events/queue/waitlistLeaveSnapshot.js
 *
 * Saves snapshot immediately when a user leaves the waitlist.
 * This marks last_left_at quickly to avoid stale data.
 */

import { Events } from "../../lib/wavez-events.js";
import { upsertWaitlistSnapshot } from "../../lib/storage.js";
import { getWaitlistPositionForIndex } from "../../lib/waitlist.js";

export default {
  name: "waitlistLeaveSnapshot",
  descriptionKey: "events.waitlistLeaveSnapshot.description",
  event: Events.ROOM_WAITLIST_LEAVE,
  // No cooldown - must trigger immediately on leave to mark last_left_at
  cooldown: 0,

  async handle(ctx, data) {
    try {
      // When user leaves, get full queue to update all positions
      const res = await ctx.api.room.getQueueStatus(ctx.room);
      const queue = res?.data ?? {};
      const entries = Array.isArray(queue?.entries) ? queue.entries : [];

      const currentDjId = queue?.playback?.djId ?? null;
      const rows = entries
        .map((entry, index) => {
          const position = getWaitlistPositionForIndex(index, entries, {
            currentDjId,
          });
          if (position == null) return null;

          return {
            userId:
              entry?.internalId ?? entry?.userId ?? entry?.user_id ?? entry?.id,
            publicId: entry?.publicId ?? entry?.id ?? null,
            username: entry?.username ?? null,
            displayName:
              entry?.displayName ??
              entry?.display_name ??
              entry?.username ??
              null,
            position,
            isCurrentDj: false,
          };
        })
        .filter((entry) => entry?.userId != null);

      await upsertWaitlistSnapshot(rows, {
        roomSlug: ctx.room,
        roomId: queue?.roomId ?? null,
        source: "event.waitlistLeaveSnapshot",
        markMissingLeft: true, // Mark users not in current queue as left
      });
    } catch (err) {
      ctx.bot._log("warn", `[waitlistLeaveSnapshot] ${err.message}`);
    }
  },
};
