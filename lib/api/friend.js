export function createFriendCalls(api) {
  return {
    list: () => api.friend.list(),
    pending: () => api.friend.pending(),
    sendRequest: (userId) => api.friend.sendRequest(userId),
    acceptRequest: (requestId) => api.friend.acceptRequest(requestId),
    remove: (friendshipId) => api.friend.remove(friendshipId),
    follow: (userId) => api.friend.follow(userId),
    unfollow: (userId) => api.friend.unfollow(userId),
    followers: () => api.friend.followers(),
  };
}
