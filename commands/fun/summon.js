import { sendChatSequence } from "../../helpers/chat.js";

export default {
  name: "summon",
  aliases: ["invocar"],
  descriptionKey: "commands.fun.summon.description",
  usageKey: "commands.fun.summon.usage",
  cooldown: 7000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, tArray } = ctx;
    const lines = tArray("commands.fun.summon.lines");
    sendChatSequence((msg) => bot.sendChat(msg), lines, 1100);
  },
};
