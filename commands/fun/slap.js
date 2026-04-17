import { pickRandom } from "../../helpers/random.js";

function formatLine(line, senderName, targetName) {
  return line
    .replaceAll("{sender}", senderName)
    .replaceAll("{target}", targetName ?? "");
}

export default {
  name: "slap",
  aliases: ["tapa"],
  descriptionKey: "commands.fun.slap.description",
  usageKey: "commands.fun.slap.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, sender, t, tArray, reply, mention, mentionUser } = ctx;
    const targetInput = String(ctx.rawArgs ?? "").trim();
    const senderName =
      sender.displayName ?? sender.username ?? t("common.someone");

    if (!targetInput) {
      const line = pickRandom(tArray("commands.fun.slap.selfLines"));
      await reply(formatLine(line, senderName, null));
      return;
    }

    const user = bot.findRoomUser(targetInput);
    if (!user) {
      await reply(
        t("commands.fun.slap.userNotFound", { user: mention(targetInput) }),
      );
      return;
    }

    const targetName = mentionUser(user, targetInput);
    const line = pickRandom(tArray("commands.fun.slap.targetLines"));
    await reply(formatLine(line, senderName, targetName));
  },
};
