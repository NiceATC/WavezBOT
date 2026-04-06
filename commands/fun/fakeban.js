import { sendChatSequence } from "../../helpers/chat.js";

function formatLine(line, targetName) {
  return line.replaceAll("{target}", targetName ?? "");
}

export default {
  name: "fakeban",
  aliases: ["banfake"],
  descriptionKey: "commands.fakeban.description",
  usageKey: "commands.fakeban.usage",
  cooldown: 8000,

  async execute(ctx) {
    const { bot, t, tArray, reply } = ctx;
    const targetInput = String(ctx.rawArgs ?? "")
      .replace(/^@/, "")
      .trim();
    if (!targetInput) {
      await reply(t("commands.fakeban.usageMessage"));
      return;
    }

    const lines = tArray("commands.fakeban.lines").map((line) =>
      formatLine(line, targetInput),
    );
    sendChatSequence((msg) => bot.sendChat(msg), lines, 1100);
  },
};
