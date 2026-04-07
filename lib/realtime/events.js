import { WavezEvents } from "../wavez-events.js";

export function onUserJoin(client, handler) {
  return client.on(WavezEvents.ROOM_USER_JOIN, handler);
}

export function onUserLeave(client, handler) {
  return client.on(WavezEvents.ROOM_USER_LEAVE, handler);
}

export function onUserKick(client, handler) {
  return client.on(WavezEvents.ROOM_USER_KICK, handler);
}

export function onUserBan(client, handler) {
  return client.on(WavezEvents.ROOM_USER_BAN, handler);
}

export function onUserRoleUpdate(client, handler) {
  return client.on(WavezEvents.ROOM_USER_ROLE_UPDATE, handler);
}

export function onRoomChatMessage(client, handler) {
  return client.on(WavezEvents.ROOM_CHAT_MESSAGE, handler);
}

export function onDjAdvance(client, handler) {
  return client.on(WavezEvents.ROOM_DJ_ADVANCE, handler);
}

export function onWaitlistUpdate(client, handler) {
  return client.on(WavezEvents.ROOM_WAITLIST_UPDATE, handler);
}

export function onWaitlistJoin(client, handler) {
  return client.on(WavezEvents.ROOM_WAITLIST_JOIN, handler);
}

export function onWaitlistLeave(client, handler) {
  return client.on(WavezEvents.ROOM_WAITLIST_LEAVE, handler);
}

export function onVote(client, handler) {
  return client.on(WavezEvents.ROOM_VOTE, handler);
}

export function onGrab(client, handler) {
  return client.on(WavezEvents.ROOM_GRAB, handler);
}

}

export function onRoomUserAvatarUpdate(client, handler) {
  return client.on(Events.ROOM_USER_AVATAR_UPDATE, handler);
}

export function onRoomUserSubscriptionUpdate(client, handler) {
  return client.on(Events.ROOM_USER_SUBSCRIPTION_UPDATE, handler);
}

export function onRoomChatMessage(client, handler) {
  return client.on(Events.ROOM_CHAT_MESSAGE, handler);
}

export function onRoomChatDelete(client, handler) {
  return client.on(Events.ROOM_CHAT_DELETE, handler);
}

export function onRoomChatUpdate(client, handler) {
  return client.on(Events.ROOM_CHAT_UPDATE, handler);
}

export function onRoomDjAdvance(client, handler) {
  return client.on(Events.ROOM_DJ_ADVANCE, handler);
}

export function onRoomDjUpdate(client, handler) {
  return client.on(Events.ROOM_DJ_UPDATE, handler);
}

export function onRoomWaitlistJoin(client, handler) {
  return client.on(Events.ROOM_WAITLIST_JOIN, handler);
}

export function onRoomWaitlistLeave(client, handler) {
  return client.on(Events.ROOM_WAITLIST_LEAVE, handler);
}

export function onRoomWaitlistUpdate(client, handler) {
  return client.on(Events.ROOM_WAITLIST_UPDATE, handler);
}

export function onRoomWaitlistLock(client, handler) {
  return client.on(Events.ROOM_WAITLIST_LOCK, handler);
}

export function onRoomWaitlistCycle(client, handler) {
  return client.on(Events.ROOM_WAITLIST_CYCLE, handler);
}

export function onRoomTimeSync(client, handler) {
  return client.on(Events.ROOM_TIME_SYNC, handler);
}

export function onRoomVote(client, handler) {
  return client.on(Events.ROOM_VOTE, handler);
}

export function onRoomGrab(client, handler) {
  return client.on(Events.ROOM_GRAB, handler);
}

export function onFriendRequest(client, handler) {
  return client.on(Events.FRIEND_REQUEST, handler);
}

export function onFriendRequestCancel(client, handler) {
  return client.on(Events.FRIEND_REQUEST_CANCEL, handler);
}

export function onFriendAccept(client, handler) {
  return client.on(Events.FRIEND_ACCEPT, handler);
}

export function onFriendRemove(client, handler) {
  return client.on(Events.FRIEND_REMOVE, handler);
}

export function onSystemMessage(client, handler) {
  return client.on(Events.SYSTEM_MESSAGE, handler);
}

export function onMaintenance(client, handler) {
  return client.on(Events.MAINTENANCE, handler);
}

export function onRateLimit(client, handler) {
  return client.on(Events.RATE_LIMIT, handler);
}
