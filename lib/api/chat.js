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
    deleteMessage: (roomId, messageId) =>
      api.roomBot.deleteMessage(roomId, messageId),
    pinMessage: (roomId, messageId) =>
      api.roomBot.pinMessage(roomId, messageId),
    clearChat: (roomId) => api.roomBot.clearChat(roomId),
  };
}
