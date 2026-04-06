export function createUserCalls(api) {
  return {
    getById: (id) => api.user.getById(id),
    getByUsername: (username) => api.user.getByUsername(username),
    getBadges: (userId) => api.user.getBadges(userId),
    listAllBadges: () => api.user.listAllBadges(),
  };
}
