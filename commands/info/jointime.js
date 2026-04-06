import { formatDuration } from "../../helpers/time.js";

export default {
  name: "jointime",
  aliases: ["tempo", "tempoonline"],
  descriptionKey: "commands.jointime.description",
  usageKey: "commands.jointime.usage",
  cooldown: 5000,

  async execute(ctx) {
    const { bot, args, sender, reply, t } = ctx;
    const targetInput = (args[0] ?? sender.username ?? sender.displayName ?? "")
      .replace(/^@/, "")
      .trim();

    if (!targetInput) {
      await reply(t("commands.jointime.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(targetInput);
    if (!user) {
      await reply(t("commands.jointime.userNotFound", { user: targetInput }));
      return;
    }

    const joinedAt = bot.getUserJoinAt(user.userId);
    const name = user.displayName ?? user.username ?? targetInput;
    if (!joinedAt) {
      await reply(t("commands.jointime.noRecord", { user: name }));
      return;
    }

    const duration = formatDuration(Date.now() - joinedAt);
    await reply(
      t("commands.jointime.reply", {
        user: name,
        duration,
      }),
    );
  },
};
