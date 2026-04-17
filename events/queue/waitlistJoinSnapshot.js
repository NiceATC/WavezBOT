/**
 * events/queue/waitlistJoinSnapshot.js
 *
 * Saves snapshot immediately when a user joins the waitlist.
 * This ensures the system knows the user is back in the queue right away.
 */

import { Events } from "../../lib/wavez-events.js";
import { upsertWaitlistSnapshot } from "../../lib/storage.js";
import { getWaitlistPositionForIndex } from "../../lib/waitlist.js";

export default {
  name: "waitlistJoinSnapshot",
  descriptionKey: "events.waitlistJoinSnapshot.description",
  event: Events.ROOM_WAITLIST_JOIN,
  // No cooldown - must trigger immediately on join to clear last_left_at
  cooldown: 0,

  async handle(ctx, data) {
    try {
      // When user joins, we need to get the full queue to save positions correctly
      const res = await ctx.api.room.getQueueStatus(ctx.room);
      const queue = res?.data ?? {};
      const entries = Array.isArray(queue?.entries) ? queue.entries : [];

      if (!entries.length) {
        return; // Queue is empty, nothing to save
      }

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
        source: "event.waitlistJoinSnapshot",
        markMissingLeft: true,
      });
    } catch (err) {
      ctx.bot._log("warn", `[waitlistJoinSnapshot] ${err.message}`);
    }
  },
};
