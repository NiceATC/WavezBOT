import { pickRandom } from "../../helpers/random.js";

function formatLine(line, senderName, targetName) {
  return line
    .replaceAll("{sender}", senderName)
    .replaceAll("{target}", targetName ?? "");
}

export default {
  name: "slap",
  aliases: ["tapa"],
  descriptionKey: "commands.slap.description",
  usageKey: "commands.slap.usage",
  cooldown: 5000,

  async execute(ctx) {
    const { bot, sender, t, tArray, reply } = ctx;
    const targetInput = String(ctx.rawArgs ?? "")
      .replace(/^@/, "")
      .trim();
    const senderName =
      sender.displayName ?? sender.username ?? t("common.someone");

    if (!targetInput) {
      const line = pickRandom(tArray("commands.slap.selfLines"));
      await reply(formatLine(line, senderName, null));
      return;
    }

    const user = bot.findRoomUser(targetInput);
    if (!user) {
      await reply(t("commands.slap.userNotFound", { user: targetInput }));
      return;
    }

    const targetName = user.displayName ?? user.username ?? targetInput;
    const line = pickRandom(tArray("commands.slap.targetLines"));
    await reply(formatLine(line, senderName, targetName));
  },
};
