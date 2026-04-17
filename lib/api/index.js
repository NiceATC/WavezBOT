import { createAuthCalls } from "./auth.js";
import { createRoomBotCalls } from "./roomBot.js";
import { createChatCalls } from "./chat.js";
import { createRoomCalls } from "./room.js";
import { createUserCalls } from "./user.js";
import { createSourceCalls } from "./source.js";
import { createSystemCalls } from "./system.js";

export function createApiCalls(api) {
  return {
    auth: createAuthCalls(api),
    roomBot: createRoomBotCalls(api),
    chat: createChatCalls(api),
    room: createRoomCalls(api),
    user: createUserCalls(api),
    source: createSourceCalls(api),
    system: createSystemCalls(api),
  };
}

export {
  createAuthCalls,
  createRoomBotCalls,
  createChatCalls,
  createRoomCalls,
  createUserCalls,
  createSourceCalls,
  createSystemCalls,
};
