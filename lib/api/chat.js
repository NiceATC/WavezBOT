/**
 * lib/api/chat.js
 *
 * Chat-related calls routed through the room-bot resource so they use
 * the bot token auth mode. For bots, roomBot.sendMessage / roomBot.deleteMessage
 * should be used instead of the regular chat endpoints.
 */
export function createChatCalls(api) {
  return {
    getMessages: (roomId, offset, limit) =>
      api.chat.getMessages(roomId, offset, limit),
    getMessagesBySlug: (slug, offset, limit) =>
      api.chat.getMessagesBySlug(slug, offset, limit),
    deleteMessage: (roomId, messageId) =>
      api.roomBot.deleteMessage(roomId, messageId),
    updateMessage: (roomId, messageId, input) =>
      api.chat.updateMessage(roomId, messageId, input),
    pinMessage: (roomId, messageId) =>
      api.roomBot.pinMessage(roomId, messageId),
    clearPinnedMessage: (roomId) => api.roomBot.clearPinnedMessage(roomId),
    clearChat: (roomId) => api.roomBot.clearChat(roomId),
  };
}
