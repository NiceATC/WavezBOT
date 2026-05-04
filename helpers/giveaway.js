/**
 * helpers/giveaway.js — Shared in-memory state for the giveaway system.
 *
 * Only one giveaway may be active at a time per bot instance.
 */

/** @type {GiveawayState | null} */
let _activeGiveaway = null;

/**
 * @typedef {Object} GiveawayState
 * @property {string}   prize        — prize description
 * @property {number}   winners      — number of winners to draw
 * @property {number}   endsAt       — epoch ms when entries close
 * @property {string|null} imageUrl  — optional announcement image URL
 * @property {Map<string,string>} participants — userId → displayName
 * @property {string[]} lastWinners  — user IDs of the last drawn winners (for reroll)
 * @property {ReturnType<typeof setTimeout>} timer — auto-end timer handle
 * @property {boolean}  ended        — true after draw has been performed
 */

export function getActiveGiveaway() {
  return _activeGiveaway;
}

export function setActiveGiveaway(state) {
  _activeGiveaway = state;
}

export function clearActiveGiveaway() {
  if (_activeGiveaway?.timer) clearTimeout(_activeGiveaway.timer);
  for (const id of _activeGiveaway?.reminderTimers ?? []) clearTimeout(id);
  _activeGiveaway = null;
}

/**
 * Parse a duration string into milliseconds.
 * Accepts: 30s, 5m, 2h, 1d  (case-insensitive)
 * Returns null if invalid.
 */
export function parseDurationMs(raw) {
  const m = String(raw ?? "").match(/^(\d+)(s|m|h|d)?$/i);
  if (!m) return null;
  const val = parseInt(m[1], 10);
  if (!val || val <= 0) return null;
  const unit = (m[2] || "m").toLowerCase();
  const factors = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return val * factors[unit];
}

/**
 * Format milliseconds as a human-readable countdown string.
 */
export function formatCountdown(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  if (totalSec >= 3600) {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  if (totalSec >= 60) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return s > 0 ? `${m}min ${s}s` : `${m}min`;
  }
  return `${totalSec}s`;
}

/**
 * Draw N unique random winners from the participants map.
 * Returns an array of { userId, displayName }.
 */
export function drawWinners(participants, count) {
  const pool = [...participants.entries()].map(([userId, displayName]) => ({
    userId,
    displayName,
  }));
  const n = Math.min(count, pool.length);
  const winners = [];
  const taken = new Set();
  while (winners.length < n) {
    const idx = Math.floor(Math.random() * pool.length);
    if (!taken.has(idx)) {
      taken.add(idx);
      winners.push(pool[idx]);
    }
  }
  return winners;
}

const MAX_CHAT_LEN = 255;

/**
 * Send a message, splitting into multiple chat messages if it exceeds
 * MAX_CHAT_LEN characters. Splits on ", " boundaries when possible so
 * name lists break cleanly.
 *
 * @param {Function} sendFn  — async fn that accepts a string (bot.sendChat or ctx.reply)
 * @param {string}   text
 */
export async function sendSplit(sendFn, text) {
  if (text.length <= MAX_CHAT_LEN) {
    await sendFn(text);
    return;
  }

  // Try to split on ", " so name lists stay readable
  const chunks = [];
  let remaining = text;
  while (remaining.length > MAX_CHAT_LEN) {
    let cut = remaining.lastIndexOf(", ", MAX_CHAT_LEN);
    if (cut <= 0)
      cut = MAX_CHAT_LEN; // hard cut if no separator found
    else cut += 2; // include the ", " in the first chunk
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length > 0) chunks.push(remaining);

  for (const chunk of chunks) {
    await sendFn(chunk);
  }
}
