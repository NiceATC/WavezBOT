import { formatDuration } from "../../helpers/time.js";

export default {
  name: "jointime",
  aliases: ["tempo", "tempoonline"],
  descriptionKey: "commands.info.jointime.description",
  usageKey: "commands.info.jointime.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, args, sender, reply, t, mention, mentionUser } = ctx;
    const targetInput = (
      args[0] ??
      sender.username ??
      sender.displayName ??
      ""
    ).trim();

    if (!targetInput) {
      await reply(t("commands.info.jointime.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(targetInput);
    if (!user) {
      await reply(
        t("commands.info.jointime.userNotFound", {
          user: mention(targetInput),
        }),
      );
      return;
    }

    const joinedAt = bot.getUserJoinAt(user.userId);
    const name = mentionUser(user, targetInput);
    if (!joinedAt) {
      await reply(t("commands.info.jointime.noRecord", { user: name }));
      return;
    }

    const duration = formatDuration(Date.now() - joinedAt);
    await reply(
      t("commands.info.jointime.reply", {
        user: name,
        duration,
      }),
    );
  },
};
