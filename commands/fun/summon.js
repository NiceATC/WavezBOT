import { sendChatSequence } from "../../helpers/chat.js";

export default {
  name: "summon",
  aliases: ["invocar"],
  descriptionKey: "commands.summon.description",
  usageKey: "commands.summon.usage",
  cooldown: 7000,

  async execute(ctx) {
    const { bot, tArray } = ctx;
    const lines = tArray("commands.summon.lines");
    sendChatSequence((msg) => bot.sendChat(msg), lines, 1100);
  },
};
