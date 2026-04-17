import { pickRandom } from "../../helpers/random.js";

function formatCookieLine(line, senderName, targetName) {
  return line
    .replaceAll("{sender}", senderName)
    .replaceAll("{target}", targetName ?? "");
}

export default {
  name: "cookie",
  descriptionKey: "commands.fun.cookie.description",
  usageKey: "commands.fun.cookie.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, sender, t, tArray, mention, mentionUser } = ctx;
    const targetInput = String(ctx.rawArgs ?? "").trim();
    const senderName =
      sender.username ?? sender.displayName ?? t("common.someone");

    if (!targetInput) {
      const line = pickRandom(tArray("commands.fun.cookie.selfLines"));
      const msg = formatCookieLine(line, senderName, null);
      await ctx.reply(msg);
      return;
    }

    const user = bot.findRoomUser(targetInput);
    if (!user) {
      await ctx.reply(
        t("commands.fun.cookie.userNotFound", { user: mention(targetInput) }),
      );
      return;
    }

    const name = mentionUser(user, targetInput);
    const line = pickRandom(tArray("commands.fun.cookie.giftLines"));
    const msg = formatCookieLine(line, senderName, name);
    await ctx.reply(msg);
  },
};
