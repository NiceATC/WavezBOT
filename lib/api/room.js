/**
 * lib/api/room.js
 *
 * Room-related calls. Moderation actions are routed through roomBot so they
 * use bot-token auth. Read-only lookups go through the public room resource.
 *
 * NOTE: The Wavez API does not expose explicit ban/kick/mute REST endpoints.
 * Role management is done via setRole; queue blocking via setQueueAccess.
 */
export function createRoomCalls(api) {
  return {
    // TODO(dev): Add wrapper helpers for room user enter/leave notifications
    // once backend emits dedicated WS payload contracts for user_joined/user_left.

    // ── Read-only ────────────────────────────────────────────────────────────
    list: () => api.room.list(),
    featured: () => api.room.featured(),
    getBySlug: (slug) => api.room.getBySlug(slug),
    getJoinPreview: (slug) => api.room.getJoinPreview(slug),
    getWaitlist: (slug) => api.room.getWaitlist(slug),
    getQueueStatus: (slug, opts) => api.room.getQueueStatus(slug, opts),
    getEvents: (roomId, opts = {}) => api.roomBot.getEvents(roomId, opts),
    create: (input) => api.room.create(input),
    join: (roomIdOrSlug) => api.room.join(roomIdOrSlug),
    favorite: (roomId) => api.room.favorite(roomId),
    unfavorite: (roomId) => api.room.unfavorite(roomId),
    createBotToken: (roomId, input) => api.room.createBotToken(roomId, input),

    // ── Bot moderation (room-bot auth) ───────────────────────────────────────
    getState: (roomId) => api.roomBot.getState(roomId),
    getManagement: (roomId) => api.roomBot.getManagement(roomId),
    listEmojis: (roomId) => api.roomBot.listEmojis(roomId),
    updateSettings: (roomId, data) => api.roomBot.updateSettings(roomId, data),
    updateLinkFilters: (roomId, input) =>
      api.roomBot.updateLinkFilters(roomId, input),
    setRole: (roomId, userId, role) =>
      api.roomBot.setRole(roomId, userId, role),
    setQueueAccess: (roomId, userId, blocked) =>
      api.roomBot.setQueueAccess(roomId, userId, blocked),
    unban: (roomId, userId) => api.roomBot.unban(roomId, userId),
    listAuditLogs: (roomId, limit) => api.roomBot.listAuditLogs(roomId, limit),
    createEmoji: (roomId, input) => api.roomBot.createEmoji(roomId, input),
    updateEmoji: (roomId, emojiId, input) =>
      api.roomBot.updateEmoji(roomId, emojiId, input),
    deleteEmoji: (roomId, emojiId) => api.roomBot.deleteEmoji(roomId, emojiId),
    /**
     * Get the ban list for a room by inspecting the management overview.
     * Returns an array of ban objects (best-effort; falls back to []).
     */
    getBans: async (roomId) => {
      const res = await api.roomBot.getManagement(roomId);
      const data = res?.data?.data ?? res?.data ?? {};
      const bans = data?.bans ?? data?.bannedUsers ?? [];
      return { ...res, data: Array.isArray(bans) ? bans : [] };
    },

    // ── Legacy shims — map old bot calls to the nearest equivalent ───────────
    /**
     * Lock the queue (old: api.room.lockWaitlist)
     * @param {string} roomId
     */
    lockWaitlist: (roomId) =>
      api.roomBot.updateSettings(roomId, { queueLocked: true }),
    /**
     * Unlock the queue (old: api.room.unlockWaitlist)
     * @param {string} roomId
     */
    unlockWaitlist: (roomId) =>
      api.roomBot.updateSettings(roomId, { queueLocked: false }),
    /**
     * Remove a user from the queue (old: api.room.removeFromWaitlist).
     * Uses setQueueAccess to block, then unblock — adjust if a direct
     * remove endpoint becomes available.
     * @param {string} roomId
     * @param {string} userId
     */
    removeFromWaitlist: (roomId, userId) =>
      api.roomBot.setQueueAccess(roomId, userId, true),
    /**
     * Add a user to the waitlist.
     * Uses room-bot auth and expects body: { userId }.
     */
    addToWaitlist: (roomId, userId) => api.roomBot.addToQueue(roomId, userId),
    /**
     * Move a user in the waitlist (old: api.room.moveInWaitlist).
     * Not yet available in the room-bot API — this is a no-op stub.
     */
    moveInWaitlist: (_roomId, _userId, _position) =>
      Promise.resolve({ data: {}, status: 200, headers: new Headers() }),
    /**
     * Skip the current track (old: api.room.skipTrack).
     * Uses updateSettings with a skipCurrent command announcement.
     * Replace with a direct endpoint if one becomes available.
     * @param {string} roomId
     */
    skipTrack: (roomId) =>
      api.roomBot.updateSettings(roomId, {
        commandAnnouncement: { commandId: "skip" },
      }),
    /**
     * Vote on the current track (old: api.room.vote).
     * Not yet exposed in the room-bot REST API.
     * Kept as a no-op — auto-woot via WebSocket commands is TODO.
     */
    vote: (_roomId, _type) =>
      Promise.resolve({ data: {}, status: 200, headers: new Headers() }),
  };
}
