/**
 * lib/api/roomBot.js
 *
 * Room-bot specific REST calls — all use bot-token auth mode.
 * These are the primary action endpoints for the Wavez chatbot.
 */
export function createRoomBotCalls(api) {
  return {
    // ── State ──────────────────────────────────────────────────────────────
    getState: (roomId) => api.roomBot.getState(roomId),

    // ── Chat ───────────────────────────────────────────────────────────────
    getMessages: (roomId, limit, offset) =>
      api.roomBot.getMessages(roomId, limit, offset),
    sendMessage: (roomId, input) => api.roomBot.sendMessage(roomId, input),
    deleteMessage: (roomId, messageId) =>
      api.roomBot.deleteMessage(roomId, messageId),
    pinMessage: (roomId, messageId) =>
      api.roomBot.pinMessage(roomId, messageId),
    clearPinnedMessage: (roomId) => api.roomBot.clearPinnedMessage(roomId),
    clearChat: (roomId) => api.roomBot.clearChat(roomId),

    // ── Management ─────────────────────────────────────────────────────────
    getManagement: (roomId) => api.roomBot.getManagement(roomId),
    listAuditLogs: (roomId, limit) => api.roomBot.listAuditLogs(roomId, limit),
    updateSettings: (roomId, input) =>
      api.roomBot.updateSettings(roomId, input),
    updateLinkFilters: (roomId, input) =>
      api.roomBot.updateLinkFilters(roomId, input),
    setRole: (roomId, userId, role) =>
      api.roomBot.setRole(roomId, userId, role),
    setQueueAccess: (roomId, userId, blocked) =>
      api.roomBot.setQueueAccess(roomId, userId, blocked),
    unban: (roomId, userId) => api.roomBot.unban(roomId, userId),

    // ── Emojis ─────────────────────────────────────────────────────────────
    listEmojis: (roomId) => api.roomBot.listEmojis(roomId),
    createEmoji: (roomId, input) => api.roomBot.createEmoji(roomId, input),
    updateEmoji: (roomId, emojiId, input) =>
      api.roomBot.updateEmoji(roomId, emojiId, input),
    deleteEmoji: (roomId, emojiId) => api.roomBot.deleteEmoji(roomId, emojiId),
  };
}
