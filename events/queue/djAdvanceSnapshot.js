/**
 * events/queue/djAdvanceSnapshot.js
 *
 * Forces a fresh queue snapshot on every DJ advance so !dc has up-to-date positions.
 */

import { Events } from "../../lib/wavez-events.js";
import { upsertWaitlistSnapshot } from "../../lib/storage.js";
import { getWaitlistPositionForIndex } from "../../lib/waitlist.js";

function toRowsFromQueueStatus(queue) {
  const entries = Array.isArray(queue?.entries) ? queue.entries : [];
  const currentDjId = queue?.playback?.djId ?? null;
  return entries
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
          entry?.displayName ?? entry?.display_name ?? entry?.username ?? null,
        position,
        isCurrentDj: false,
      };
    })
    .filter((entry) => entry?.userId != null);
}

export default {
  name: "djAdvanceSnapshot",
  description: "Update waitlist snapshot on each DJ advance",
  event: Events.ROOM_DJ_ADVANCE,
  cooldown: 0,

  async handle(ctx) {
    try {
      const res = await ctx.api.room.getQueueStatus(ctx.room);
      const queue = res?.data ?? {};
      const rows = toRowsFromQueueStatus(queue);

      await upsertWaitlistSnapshot(rows, {
        roomSlug: ctx.room,
        roomId: queue?.roomId ?? null,
        source: "event.djAdvanceSnapshot",
        markMissingLeft: true,
      });
    } catch (err) {
      ctx.bot._log("warn", `[djAdvanceSnapshot] ${err.message}`);
    }
  },
};
