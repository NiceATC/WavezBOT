/**
 * events/queue/waitlistJoinSnapshot.js
 *
 * Saves snapshot immediately when a user joins the waitlist.
 * This ensures the system knows the user is back in the queue right away.
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
  name: "waitlistJoinSnapshot",
  descriptionKey: "events.waitlistJoinSnapshot.description",
  event: Events.ROOM_WAITLIST_JOIN,
  // No cooldown - must trigger immediately on join to update snapshot
  cooldown: 0,

  async handle(ctx, data) {
    try {
      // Try to parse the event payload first (new API may include full queue).
      let snapshot = parseRoomQueueSnapshot(data ?? {});
      let rows = entriesToRows(snapshot?.entries ?? []);

      if (!rows.length) {
        const res = await ctx.api.room.getQueueStatus(ctx.room);
        const fresh = parseRoomQueueSnapshot(res?.data ?? {});
        rows = entriesToRows(fresh?.entries ?? []);
      }

      if (!rows.length) return;

      await upsertWaitlistSnapshot(rows, {
        roomSlug: ctx.room,
        roomId: snapshot?.roomId ?? null,
        source: "event.waitlistJoinSnapshot",
        // markMissingLeft is intentionally false: the WS waitlist_join event
        // fires before the REST API includes the new entry, so the joining
        // user often appears absent — markMissingLeft would incorrectly stamp
        // last_left_at on them. Leave events handle that via waitlistLeaveSnapshot.
        markMissingLeft: false,
      });
    } catch (err) {
      ctx.bot._log("warn", `[waitlistJoinSnapshot] ${err.message}`);
    }
  },
};
