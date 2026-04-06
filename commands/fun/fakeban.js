import { sendChatSequence } from "../../helpers/chat.js";

function formatLine(line, targetName) {
  return line.replaceAll("{target}", targetName ?? "");
}

export default {
  name: "fakeban",
  aliases: ["banfake"],
  descriptionKey: "commands.fun.fakeban.description",
  usageKey: "commands.fun.fakeban.usage",
  cooldown: 8000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, t, tArray, reply } = ctx;
    const targetInput = String(ctx.rawArgs ?? "")
      .replace(/^@/, "")
      .trim();
    if (!targetInput) {
      await reply(t("commands.fun.fakeban.usageMessage"));
      return;
    }

    const lines = tArray("commands.fun.fakeban.lines").map((line) =>
      formatLine(line, targetInput),
    );
    sendChatSequence((msg) => bot.sendChat(msg), lines, 1100);
  },
};
