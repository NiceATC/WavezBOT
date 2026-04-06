import { sendChatSequence } from "../../helpers/chat.js";

export default {
  name: "explode",
  aliases: ["boom"],
  descriptionKey: "commands.explode.description",
  usageKey: "commands.explode.usage",
  cooldown: 7000,

  async execute(ctx) {
    const { bot, tArray } = ctx;
    const lines = tArray("commands.explode.lines");
    sendChatSequence((msg) => bot.sendChat(msg), lines, 1100);
  },
};
