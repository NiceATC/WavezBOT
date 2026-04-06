/**
 * lib/api/auth.js — Auth calls (kept for optional user-session helpers).
 * For server-side bots, room bot token auth is preferred (see roomBot.js).
 */
export function createAuthCalls(api) {
  return {
    login: (credentials) => api.auth.login(credentials),
    me: () => api.auth.me(),
  };
}
