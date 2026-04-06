import { sendChatSequence } from "../../helpers/chat.js";

function formatLine(line, senderName, targetName) {
  return line
    .replaceAll("{user}", senderName)
    .replaceAll("{target}", targetName ?? "");
}

export default {
  name: "hack",
  descriptionKey: "commands.hack.description",
  usageKey: "commands.hack.usage",
  cooldown: 8000,

  async execute(ctx) {
    const { bot, sender, t, tArray, reply } = ctx;
    const targetInput = String(ctx.rawArgs ?? "")
      .replace(/^@/, "")
      .trim();
    if (!targetInput) {
      await reply(t("commands.hack.usageMessage"));
      return;
    }

    const senderName =
      sender.displayName ?? sender.username ?? t("common.someone");
    const targetName = targetInput;
    const lines = tArray("commands.hack.lines").map((line) =>
      formatLine(line, senderName, targetName),
    );

    sendChatSequence((msg) => bot.sendChat(msg), lines, 1100);
  },
};
