/**
 * lib/pipeline/constants.js
 *
 * Re-exports Wavez event name constants and common role/permission helpers.
 */
export { WavezEvents as Events, WavezEvents } from "../wavez-events.js";

// ── Role hierarchy ─────────────────────────────────────────────────────────

export const Roles = Object.freeze({
  HOST: "host",
  COHOST: "cohost",
  MANAGER: "manager",
  BOUNCER: "bouncer",
  RESIDENT_DJ: "resident_dj",
  USER: "user",
});

export const RoomRoles = Roles;

// ── Placeholder constants kept for backward compatibility ───────────────────

export const MAX_MESSAGE_LENGTH = 512;
export const MAX_ITEMS_PER_PLAYLIST = 500;
export const MAX_PLAYLISTS_PER_USER = 50;
export const MAX_PLAYLIST_NAME_LENGTH = 64;
export const MIN_PLAYLIST_NAME_LENGTH = 1;
export const MAX_TITLE_LENGTH = 200;
export const MAX_ARTIST_LENGTH = 100;
export const MAX_MEDIA_DURATION = 7200;
