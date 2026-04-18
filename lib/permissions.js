/**
 * lib/permissions.js
 *
 * Shared role hierarchy used by bot.js and the CommandRegistry to enforce
 * minRole guards before dispatching commands.
 *
 * Global platform roles (apply in every room regardless of room role):
 *   developer   1000  — platform developer / superuser
 *   admin        500  — platform administrator
 *   ambassador   200  — platform ambassador
 *
 * Room roles (scoped to the current room):
 *   host        100
 *   cohost       80
 *   manager      60
 *   bouncer      50
 *   resident_dj  20
 *   user          0
 *
 * Source: @wavezfm/api types.d.ts (platformRole)
 */

export const ROLE_LEVELS = {
  // Global platform roles — stored in user.platformRole / user.platformRoles
  admin: 400,
  developer: 300,
  ambassador: 200,

  // Room-scoped roles
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

/**
 * Returns the highest numeric privilege level from a list of platform roles.
 * Used when a user has multiple platform roles (platformRoles array).
 * @param {string[]|null|undefined} roles
 * @returns {number}
 */
export function getPlatformRoleLevel(roles) {
  if (!roles?.length) return 0;
  return Math.max(0, ...roles.map((r) => getRoleLevel(r)));
}
