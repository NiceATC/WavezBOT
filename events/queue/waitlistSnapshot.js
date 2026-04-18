/**
 * events/waitlistSnapshot.js
 *
 * Saves the current waitlist snapshot for DC restore.
 */

import { Events } from "../../lib/wavez-events.js";
import { upsertWaitlistSnapshot } from "../../lib/storage.js";
import { parseRoomQueueSnapshot } from "@wavezfm/api";

function entriesToRows(entries) {
  return entries
    .filter((e) => e?.internalId)
    .map((entry) => ({
      userId: entry.internalId,
      publicId: entry.publicId ?? entry.id ?? null,
      username: entry.username ?? null,
      displayName: entry.displayName ?? entry.username ?? null,
      position: entry.position,
      isCurrentDj: Boolean(entry.isCurrentDj),
    }));
}

export default {
  name: "waitlistSnapshot",
  descriptionKey: "events.waitlistSnapshot.description",
  // room_state_snapshot fires on every track advance and room state change.
  // queue_reordered fires when queue order changes.
  // ROOM_USER_LEAVE: excluded - bot.js calls markWaitlistUserLeft() directly.
  // ROOM_USER_JOIN: excluded - race condition with markMissingLeft (user may
  // not be in queue yet when REST snapshot arrives).
  events: [Events.ROOM_STATE_SNAPSHOT, Events.ROOM_QUEUE_REORDERED],
  cooldown: 2000,

  async handle(ctx, data) {
    try {
      // Try parsing the event payload directly first (avoids a REST round-trip
      // when the server sends the full queue in the event, e.g. room_state_snapshot).
      let snapshot = parseRoomQueueSnapshot(data ?? {});
      let rows = entriesToRows(snapshot?.entries ?? []);
      const roomId = snapshot?.roomId ?? null;

      if (!rows.length) {
        const res = await ctx.api.room.getQueueStatus(ctx.room);
        const fresh = parseRoomQueueSnapshot(res?.data ?? {});
        rows = entriesToRows(fresh?.entries ?? []);
      }

      await upsertWaitlistSnapshot(rows, {
        roomSlug: ctx.room,
        roomId,
        source: "event.waitlistSnapshot",
        markMissingLeft: true,
      });
    } catch (err) {
      ctx.bot._log("warn", `[waitlistSnapshot] ${err.message}`);
    }
  },
};
