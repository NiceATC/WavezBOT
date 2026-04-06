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

  // ── DJ Booth ───────────────────────────────────────────────────────────────
  ROOM_DJ_ADVANCE: "booth_advance",

  // ── Waitlist / Queue ───────────────────────────────────────────────────────
  ROOM_WAITLIST_UPDATE: "waitlist_update",
  ROOM_WAITLIST_JOIN: "waitlist_join",
  ROOM_WAITLIST_LEAVE: "waitlist_leave",

  // ── Reactions ─────────────────────────────────────────────────────────────
  ROOM_VOTE: "vote_updated",
  ROOM_GRAB: "track_grabbed",

  // ── Users ─────────────────────────────────────────────────────────────────
  ROOM_USER_JOIN: "user_joined",
  ROOM_USER_LEAVE: "user_left",
  ROOM_USER_KICK: "user_kicked",
  ROOM_USER_BAN: "user_banned",
  ROOM_USER_ROLE_UPDATE: "user_role_updated",

  // ── Connection lifecycle (emitted by the realtime client itself) ───────────
  WS_OPEN: "open",
  WS_CLOSE: "close",
  WS_CONNECTED: "connected",
  WS_ERROR: "socket_error",

  // ── Server error packets (type:"error" in the WS envelope) ────────────────
  WS_PACKET_ERROR: "error",
});

/**
 * Convenience alias — drop-in replacement for `Events` from the old borealise pipeline.
 * Event handlers that previously imported `Events` can import this instead.
 */
export const Events = WavezEvents;
