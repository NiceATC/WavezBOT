/**
 * events/queue/roomLeaveSnapshot.js
 *
 * Immediately marks last_left_at for a user when they leave the room.
 *
 * The generic waitlistSnapshot handler has a 2000ms global cooldown shared
 * across several events (ROOM_STATE_SNAPSHOT, ROOM_USER_JOIN, etc.). When
 * ROOM_STATE_SNAPSHOT and ROOM_USER_LEAVE fire within that window (which they
 * almost always do when someone disconnects), the ROOM_USER_LEAVE call gets
 * throttled and last_left_at never gets written.
 *
 * This handler listens exclusively to ROOM_USER_LEAVE with no cooldown, so
 * last_left_at is always written immediately for the right user without
 * blocking on queue re-queries or competing with other snapshot events.
 */

import { Events } from "../../lib/wavez-events.js";
import { markWaitlistUserLeft } from "../../lib/storage.js";

export default {
  name: "roomLeaveSnapshot",
  descriptionKey: "events.roomLeaveSnapshot.description",
  event: Events.ROOM_USER_LEAVE,
  cooldown: 0,

  async handle(ctx, data) {
    try {
      const userId =
        data?.userId ??
        data?.user_id ??
        data?.user?.userId ??
        data?.user?.user_id ??
        data?.user?.id ??
        null;

      if (!userId) return;

      const username = data?.username ?? data?.user?.username ?? null;

      await markWaitlistUserLeft(String(userId), {
        roomSlug: ctx.room,
        username: username ? String(username) : undefined,
      });
    } catch (err) {
      ctx.bot._log("warn", `[roomLeaveSnapshot] ${err.message}`);
    }
  },
};
