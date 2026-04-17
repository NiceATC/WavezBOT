/**
 * events/waitlistSnapshot.js
 *
 * Saves the current waitlist snapshot for DC restore.
 */

import { Events } from "../../lib/wavez-events.js";
import { upsertWaitlistSnapshot } from "../../lib/storage.js";
import { getWaitlistPositionForIndex } from "../../lib/waitlist.js";

function getSnapshotCurrentDjId(snapshot) {
  return (
    snapshot?.playback?.djId ??
    snapshot?.playback?.dj?.userId ??
    snapshot?.playback?.dj?.user_id ??
    snapshot?.playback?.dj?.id ??
    snapshot?.dj?.userId ??
    snapshot?.dj?.user_id ??
    snapshot?.dj?.id ??
    snapshot?.currentDj?.userId ??
    snapshot?.currentDj?.user_id ??
    snapshot?.currentDj?.id ??
    snapshot?.current_dj?.userId ??
    snapshot?.current_dj?.user_id ??
    snapshot?.current_dj?.id ??
    null
  );
}

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

function toRowsFromRoomSnapshot(snapshot) {
  const queueIds = Array.isArray(snapshot?.queue)
    ? snapshot.queue.map(String)
    : [];
  const users = Array.isArray(snapshot?.users) ? snapshot.users : [];
  if (!queueIds.length || !users.length) return [];
  const currentDjId = getSnapshotCurrentDjId(snapshot);

  const userMap = new Map(
    users
      .map((user) => {
        const uid = user?.id ?? user?.userId ?? user?.user_id;
        if (uid == null) return null;
        return [String(uid), user];
      })
      .filter(Boolean),
  );

  return queueIds
    .map((uid, index) => {
      const position = getWaitlistPositionForIndex(index, queueIds, {
        currentDjId,
      });
      if (position == null) return null;

      const user = userMap.get(uid);
      return {
        userId: uid,
        publicId: user?.publicId ?? user?.id ?? null,
        username: user?.username ?? null,
        displayName:
          user?.displayName ?? user?.display_name ?? user?.username ?? null,
        position,
        isCurrentDj: false,
      };
    })
    .filter((entry) => entry?.userId != null);
}

export default {
  name: "waitlistSnapshot",
  descriptionKey: "events.waitlistSnapshot.description",
  // room_state_snapshot is sent on every track advance (and user join/leave).
  // queue_reordered fires when the queue order changes.
  events: [
    Events.ROOM_STATE_SNAPSHOT,
    Events.ROOM_QUEUE_REORDERED,
    Events.ROOM_USER_JOIN,
    Events.ROOM_USER_LEAVE,
  ],
  cooldown: 2000,

  async handle(ctx, data) {
    try {
      let rows = toRowsFromRoomSnapshot(data ?? null);
      let roomId = data?.roomId ?? null;

      if (!rows.length) {
        const res = await ctx.api.room.getQueueStatus(ctx.room);
        const queue = res?.data ?? {};
        rows = toRowsFromQueueStatus(queue);
        roomId = roomId ?? queue?.roomId ?? null;
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
