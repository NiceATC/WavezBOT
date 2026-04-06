import { sendChatSequence } from "../../helpers/chat.js";

function formatLine(line, senderName, targetName) {
  return line
    .replaceAll("{user}", senderName)
    .replaceAll("{target}", targetName ?? "");
}

export default {
  name: "hack",
  descriptionKey: "commands.fun.hack.description",
  usageKey: "commands.fun.hack.usage",
  cooldown: 8000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, sender, t, tArray, reply } = ctx;
    const targetInput = String(ctx.rawArgs ?? "")
      .replace(/^@/, "")
      .trim();
    if (!targetInput) {
      await reply(t("commands.fun.hack.usageMessage"));
      return;
    }

    const senderName =
      sender.displayName ?? sender.username ?? t("common.someone");
    const targetName = targetInput;
    const lines = tArray("commands.fun.hack.lines").map((line) =>
      formatLine(line, senderName, targetName),
    );

    sendChatSequence((msg) => bot.sendChat(msg), lines, 1100);
  },
};
