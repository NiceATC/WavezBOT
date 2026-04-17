/**
 * lib/api/auth.js — Auth calls (kept for optional user-session helpers).
 * For server-side bots, room bot token auth is preferred (see roomBot.js).
 */
export function createAuthCalls(api) {
  return {
    login: (credentials) => api.auth.login(credentials),
    register: (input) => api.auth.register(input),
    me: () => api.auth.me(),
    getPendingTwoFactor: () => api.auth.getPendingTwoFactor(),
    sendPendingTwoFactorCode: (input) =>
      api.auth.sendPendingTwoFactorCode(input),
    verifyPendingTwoFactor: (input) => api.auth.verifyPendingTwoFactor(input),
    getTwoFactorStatus: () => api.auth.getTwoFactorStatus(),
  };
}
