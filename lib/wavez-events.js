/**
 * lib/wavez-events.js
 *
 * Wavez platform WebSocket event name constants.
 *
 * These are string keys emitted by the Wavez WebSocket server inside each
 * WsPacket.event field. Adjust the values here if the server ever renames an
 * event — the rest of the codebase only references this module.
 *
 * Usage:
 *   import { WavezEvents } from "./wavez-events.js";
 *   bot.on(WavezEvents.ROOM_CHAT_MESSAGE, handler);
 */

export const WavezEvents = Object.freeze({
  // ── Chat ───────────────────────────────────────────────────────────────────
  ROOM_CHAT_MESSAGE: "message_created",
  ROOM_CHAT_MESSAGE_UPDATED: "message_updated",
  ROOM_CHAT_MESSAGE_DELETED: "message_deleted",
  ROOM_CHAT_CLEARED: "chat_cleared",

  // ── DJ Booth ───────────────────────────────────────────────────────────────
  ROOM_DJ_ADVANCE: "track_started",
  ROOM_TRACK_SKIPPED: "track_skipped",
  ROOM_TRACK_PAUSED: "track_paused",
  ROOM_TRACK_RESUMED: "track_resumed",

  // ── Room snapshot ────────────────────────────────────────────────
  ROOM_STATE_SNAPSHOT: "room_state_snapshot",

  // ── Waitlist / Queue ───────────────────────────────────────────────────────
  ROOM_WAITLIST_UPDATE: "waitlist_update",
  ROOM_WAITLIST_JOIN: "queue_joined",
  ROOM_WAITLIST_LEAVE: "waitlist_leave",
  ROOM_QUEUE_REORDERED: "queue_reordered",

  // ── Reactions ─────────────────────────────────────────────────────────────
  ROOM_VOTE: "votes_snapshot",
  ROOM_GRAB: "track_grabbed",

  // ── Users ─────────────────────────────────────────────────────────────────
  ROOM_USER_JOIN: "user_joined",
  ROOM_USER_LEAVE: "user_left",
  ROOM_USER_KICK: "user_kicked",
  ROOM_USER_BAN: "user_banned",
  ROOM_USER_ROLE_UPDATE: "user_role_updated",
  ROOM_USER_UPDATE: "user_updated",

  // ── Connection lifecycle (emitted by the realtime client itself) ───────────
  WS_OPEN: "open",
  WS_CLOSE: "close",
  WS_CONNECTED: "connected",
  WS_ERROR: "socket_error",
  WS_PONG: "pong",

  // ── Server error packets (type:"error" in the WS envelope) ────────────────
  WS_PACKET_ERROR: "error",
});

/**
 * Convenience alias — drop-in replacement for `Events` from the old borealise pipeline.
 * Event handlers that previously imported `Events` can import this instead.
 */
export const Events = WavezEvents;
