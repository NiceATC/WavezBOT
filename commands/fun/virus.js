import { sendChatSequence } from "../../helpers/chat.js";

export default {
  name: "virus",
  descriptionKey: "commands.virus.description",
  usageKey: "commands.virus.usage",
  cooldown: 7000,

  async execute(ctx) {
    const { bot, tArray } = ctx;
    const lines = tArray("commands.virus.lines");
    sendChatSequence((msg) => bot.sendChat(msg), lines, 1100);
  },
};
