import { sendChatSequence } from "../../helpers/chat.js";

export default {
  name: "virus",
  descriptionKey: "commands.fun.virus.description",
  usageKey: "commands.fun.virus.usage",
  cooldown: 7000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, tArray } = ctx;
    const lines = tArray("commands.fun.virus.lines");
    sendChatSequence((msg) => bot.sendChat(msg), lines, 1100);
  },
};
