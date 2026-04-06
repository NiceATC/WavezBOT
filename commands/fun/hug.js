import { pickRandom } from "../../helpers/random.js";

function formatLine(line, senderName, targetName) {
  return line
    .replaceAll("{sender}", senderName)
    .replaceAll("{target}", targetName ?? "");
}

export default {
  name: "hug",
  aliases: ["abraco"],
  descriptionKey: "commands.fun.hug.description",
  usageKey: "commands.fun.hug.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, sender, t, tArray, reply } = ctx;
    const targetInput = String(ctx.rawArgs ?? "")
      .replace(/^@/, "")
      .trim();
    const senderName =
      sender.displayName ?? sender.username ?? t("common.someone");

    if (!targetInput) {
      const line = pickRandom(tArray("commands.fun.hug.selfLines"));
      await reply(formatLine(line, senderName, null));
      return;
    }

    const user = bot.findRoomUser(targetInput);
    if (!user) {
      await reply(t("commands.fun.hug.userNotFound", { user: targetInput }));
      return;
    }

    const targetName = user.displayName ?? user.username ?? targetInput;
    const line = pickRandom(tArray("commands.fun.hug.targetLines"));
    await reply(formatLine(line, senderName, targetName));
  },
};
