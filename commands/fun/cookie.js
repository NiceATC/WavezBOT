import { pickRandom } from "../../helpers/random.js";

function formatCookieLine(line, senderName, targetName) {
  return line
    .replaceAll("{sender}", senderName)
    .replaceAll("{target}", targetName ?? "");
}

export default {
  name: "cookie",
  descriptionKey: "commands.cookie.description",
  usageKey: "commands.cookie.usage",
  cooldown: 5000,

  async execute(ctx) {
    const { bot, sender, t, tArray } = ctx;
    const targetInput = String(ctx.rawArgs ?? "")
      .replace(/^@/, "")
      .trim();
    const senderName =
      sender.username ?? sender.displayName ?? t("common.someone");

    if (!targetInput) {
      const line = pickRandom(tArray("commands.cookie.selfLines"));
      const msg = formatCookieLine(line, senderName, null);
      await ctx.reply(msg);
      return;
    }

    const user = bot.findRoomUser(targetInput);
    if (!user) {
      await ctx.reply(t("commands.cookie.userNotFound", { user: targetInput }));
      return;
    }

    const name = user.username ?? user.displayName ?? targetInput;
    const line = pickRandom(tArray("commands.cookie.giftLines"));
    const msg = formatCookieLine(line, senderName, name);
    await ctx.reply(msg);
  },
};
