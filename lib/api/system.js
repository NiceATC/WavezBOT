/**
 * lib/api/system.js
 *
 * Public platform health and stats endpoints.
 */
export function createSystemCalls(api) {
  return {
    status: () => api.system.status(),
    publicStats: () => api.system.publicStats(),
    health: () => api.system.health(),
  };
}
