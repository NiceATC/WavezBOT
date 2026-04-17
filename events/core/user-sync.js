/**
 * events/core/user-sync.js
 *
 * Registers / updates the user profile in users.sqlite whenever a user
 * joins the room. This is the entry-point for the unified user system.
 *
 * All user data (XP, balance, stats, daily, work) lives in the `users`
 * table keyed by user_id. This event ensures every user has a row before
 * any other system tries to update their data.
 */

import { Events } from "../../lib/wavez-events.js";
import { ensureUser } from "../../lib/storage.js";

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value == null) continue;
    const str = String(value).trim();
    if (str) return str;
  }
  return null;
}

function isRoomBotId(userId) {
  return String(userId).startsWith("room-bot:");
}

function toIdentity(user) {
  const username = firstNonEmpty(
    user?.username,
    user?.userName,
    user?.handle,
    user?.login,
  );
  const displayName = firstNonEmpty(
    user?.displayUsername,
    user?.displayName,
    user?.display_name,
    user?.name,
    user?.nickname,
    user?.nick,
    user?.username,
  );

  return {
    // Keep fields separate: username should never be inferred from displayName.
    username,
    displayName,
  };
}

function toUserId(user) {
  const id = user?.userId ?? user?.user_id ?? user?.id ?? null;
  return id == null ? "" : String(id);
}

async function syncOne(ctx, user) {
  const userId = toUserId(user);
  if (!userId || isRoomBotId(userId) || userId === String(ctx.bot._userId))
    return;
  await ensureUser(userId, toIdentity(user));
}

async function syncSnapshotUsers(ctx, snapshot) {
  const users = Array.isArray(snapshot?.users) ? snapshot.users : [];
  if (!users.length) return;
  for (const user of users) {
    await syncOne(ctx, user);
  }
}

export default {
  name: "user-sync",
  enabled: true,

  events: [
    Events.ROOM_USER_JOIN,
    Events.ROOM_USER_UPDATE,
    Events.ROOM_STATE_SNAPSHOT,
  ],

  async handle(ctx, data) {
    // Snapshot contains all users already in room, while join captures newcomers.
    if (Array.isArray(data?.users)) {
      await syncSnapshotUsers(ctx, data);
      return;
    }

    await syncOne(ctx, data);
  },
};
