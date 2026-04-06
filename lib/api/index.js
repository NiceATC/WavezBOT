import { createRoomBotCalls } from "./roomBot.js";
import { createChatCalls } from "./chat.js";
import { createRoomCalls } from "./room.js";
import { createUserCalls } from "./user.js";
import { createPlaylistCalls } from "./playlist.js";
import { createSourceCalls } from "./source.js";
import { createShopCalls } from "./shop.js";
import { createFriendCalls } from "./friend.js";

export function createApiCalls(api) {
  return {
    roomBot: createRoomBotCalls(api),
    chat: createChatCalls(api),
    room: createRoomCalls(api),
    user: createUserCalls(api),
    playlist: createPlaylistCalls(api),
    source: createSourceCalls(api),
    shop: createShopCalls(api),
    friend: createFriendCalls(api),
  };
}

export {
  createRoomBotCalls,
  createChatCalls,
  createRoomCalls,
  createUserCalls,
  createPlaylistCalls,
  createSourceCalls,
  createShopCalls,
  createFriendCalls,
};
