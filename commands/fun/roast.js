import { pickRandom } from "../../helpers/random.js";

function formatLine(line, senderName, targetName) {
  return line
    .replaceAll("{sender}", senderName)
    .replaceAll("{target}", targetName ?? "");
}

export default {
  name: "roast",
  aliases: ["insulto"],
  descriptionKey: "commands.fun.roast.description",
  usageKey: "commands.fun.roast.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, sender, t, tArray, reply } = ctx;
    const targetInput = String(ctx.rawArgs ?? "").trim();
    const senderName =
      sender.displayName ?? sender.username ?? t("common.someone");

    let targetName = senderName;
    if (targetInput) {
      const user = bot.findRoomUser(targetInput);
      targetName = user?.displayName ?? user?.username ?? targetInput;
    }

    const line = pickRandom(tArray("commands.fun.roast.lines"));
    await reply(formatLine(line, senderName, targetName));
  },
};
