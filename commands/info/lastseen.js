import { formatDuration } from "../../helpers/time.js";

export default {
  name: "lastseen",
  aliases: ["last", "seen"],
  descriptionKey: "commands.lastseen.description",
  usageKey: "commands.lastseen.usage",
  cooldown: 5000,

  async execute(ctx) {
    const { bot, args, sender, reply, t } = ctx;
    const targetInput = (args[0] ?? sender.username ?? sender.displayName ?? "")
      .replace(/^@/, "")
      .trim();

    if (!targetInput) {
      await reply(t("commands.lastseen.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(targetInput);
    if (!user) {
      await reply(t("commands.lastseen.userNotFound", { user: targetInput }));
      return;
    }

    const lastAt = bot.getLastChatAt(user.userId);
    const name = user.displayName ?? user.username ?? targetInput;
    if (!lastAt) {
      await reply(t("commands.lastseen.noRecord", { user: name }));
      return;
    }

    const ago = formatDuration(Date.now() - lastAt);
    await reply(
      t("commands.lastseen.reply", {
        user: name,
        duration: ago,
      }),
    );
  },
};
