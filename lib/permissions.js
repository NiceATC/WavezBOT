/**
 * lib/permissions.js
 *
 * Shared role hierarchy used by bot.js and the CommandRegistry to enforce
 * minRole guards before dispatching commands.
 *
 * Hierarchy (higher = more privileged):
 *   host        100
 *   cohost       80
 *   manager      60
 *   bouncer      50
 *   resident_dj  20
 *   user          0
 *
 * Source: BOREALISE_API_REFERENCE.md §3.1 + woot/src/features/commands.js
 */

export const ROLE_LEVELS = {
  host: 100,
  cohost: 80,
  manager: 60,
  bouncer: 50,
  resident_dj: 20,
  user: 0,
};

/**
 * Returns the numeric privilege level for a role string.
 * Unknown / null roles are treated as "user" (0).
 * @param {string|null|undefined} role
 * @returns {number}
 */
export function getRoleLevel(role) {
  return ROLE_LEVELS[(role ?? "").toLowerCase()] ?? 0;
}
