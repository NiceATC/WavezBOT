import { sendChatSequence } from "../../helpers/chat.js";

export default {
  name: "explode",
  aliases: ["boom"],
  descriptionKey: "commands.fun.explode.description",
  usageKey: "commands.fun.explode.usage",
  cooldown: 7000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, tArray } = ctx;
    const lines = tArray("commands.fun.explode.lines");
    sendChatSequence((msg) => bot.sendChat(msg), lines, 1100);
  },
};
