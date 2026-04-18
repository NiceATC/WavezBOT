/**
 * events/queue/djAdvanceSnapshot.js
 *
 * Forces a fresh queue snapshot on every DJ advance so !dc has up-to-date positions.
 */

import { Events } from "../../lib/wavez-events.js";
import { upsertWaitlistSnapshot } from "../../lib/storage.js";
import { parseRoomQueueSnapshot } from "@wavezfm/api";

export default {
  name: "djAdvanceSnapshot",
  description: "Update waitlist snapshot on each DJ advance",
  event: Events.ROOM_DJ_ADVANCE,
  cooldown: 0,

  async handle(ctx) {
    try {
      const res = await ctx.api.room.getQueueStatus(ctx.room);
      const snapshot = parseRoomQueueSnapshot(res?.data ?? {});
      const rows = (snapshot?.entries ?? [])
        .filter((e) => e?.internalId)
        .map((entry) => ({
          userId: entry.internalId,
          publicId: entry.publicId ?? entry.id ?? null,
          username: entry.username ?? null,
          displayName: entry.displayName ?? entry.username ?? null,
          position: entry.position,
          isCurrentDj: Boolean(entry.isCurrentDj),
        }));

      await upsertWaitlistSnapshot(rows, {
        roomSlug: ctx.room,
        roomId: snapshot?.roomId ?? null,
        source: "event.djAdvanceSnapshot",
        markMissingLeft: true,
      });
    } catch (err) {
      ctx.bot._log("warn", `[djAdvanceSnapshot] ${err.message}`);
    }
  },
};
