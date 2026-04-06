import { formatDuration } from "../../helpers/time.js";

export default {
  name: "lastseen",
  aliases: ["last", "seen"],
  descriptionKey: "commands.info.lastseen.description",
  usageKey: "commands.info.lastseen.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, args, sender, reply, t } = ctx;
    const targetInput = (args[0] ?? sender.username ?? sender.displayName ?? "")
      .replace(/^@/, "")
      .trim();

    if (!targetInput) {
      await reply(t("commands.info.lastseen.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(targetInput);
    if (!user) {
      await reply(t("commands.info.lastseen.userNotFound", { user: targetInput }));
      return;
    }

    const lastAt = bot.getLastChatAt(user.userId);
    const name = user.displayName ?? user.username ?? targetInput;
    if (!lastAt) {
      await reply(t("commands.info.lastseen.noRecord", { user: name }));
      return;
    }

    const ago = formatDuration(Date.now() - lastAt);
    await reply(
      t("commands.info.lastseen.reply", {
        user: name,
        duration: ago,
      }),
    );
  },
};
