/**
 * events/queue/waitlistLeaveSnapshot.js
 *
 * Immediately marks last_left_at when a user leaves the waitlist, then
 * updates positions for the remaining queue.
 *
 * IMPORTANT: We mark the leaving user DIRECTLY via markWaitlistUserLeft
 * instead of relying on markMissingLeft.  The markMissingLeft approach is
 * subject to a race condition: the REST API may still include the user in
 * the queue snapshot for a brief moment after the WS event fires, causing
 * the mark to be silently skipped.
 */

import { Events } from "../../lib/wavez-events.js";
import {
  upsertWaitlistSnapshot,
  markWaitlistUserLeft,
} from "../../lib/storage.js";
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
  name: "waitlistLeaveSnapshot",
  descriptionKey: "events.waitlistLeaveSnapshot.description",
  event: Events.ROOM_WAITLIST_LEAVE,
  // No cooldown - must trigger immediately on leave to mark last_left_at
  cooldown: 0,

  async handle(ctx, data) {
    try {
      // Step 1: immediately mark the leaving user.  The WS event carries the
      // stable platform userId (UUID) which matches waitlist_state.user_id.
      const userId =
        data?.userId ??
        data?.user_id ??
        data?.user?.userId ??
        data?.user?.user_id ??
        null;
      const username = data?.username ?? data?.user?.username ?? null;

      if (userId) {
        await markWaitlistUserLeft(String(userId), {
          roomSlug: ctx.room,
          username: username ? String(username) : undefined,
        });
      }

      // Step 2: update positions for remaining users.
      // Try to use the event payload first (new API may include full queue).
      // markMissingLeft is disabled — the direct call above handles last_left_at.
      let snapshot = parseRoomQueueSnapshot(data ?? {});
      let rows = entriesToRows(snapshot?.entries ?? []);

      if (!rows.length) {
        const res = await ctx.api.room.getQueueStatus(ctx.room);
        const fresh = parseRoomQueueSnapshot(res?.data ?? {});
        rows = entriesToRows(fresh?.entries ?? []);
      }

      if (rows.length > 0) {
        await upsertWaitlistSnapshot(rows, {
          roomSlug: ctx.room,
          roomId: snapshot?.roomId ?? null,
          source: "event.waitlistLeaveSnapshot",
          markMissingLeft: false,
        });
      }
    } catch (err) {
      ctx.bot._log("warn", `[waitlistLeaveSnapshot] ${err.message}`);
    }
  },
};
