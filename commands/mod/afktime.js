import { formatDuration } from "../../helpers/time.js";

export default {
  name: "afktime",
  aliases: ["afk"],
  descriptionKey: "commands.mod.afktime.description",
  usageKey: "commands.mod.afktime.usage",
  cooldown: 5000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { bot, args, sender, reply, t, mention, mentionUser } = ctx;
    const targetInput = (
      args[0] ??
      sender.username ??
      sender.displayName ??
      ""
    ).trim();

    if (!targetInput) {
      await reply(t("commands.mod.afktime.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(targetInput);
    if (!user) {
      await reply(
        t("commands.mod.afktime.userNotFound", { user: mention(targetInput) }),
      );
      return;
    }

    if (bot.isBotUser(user.userId)) {
      await reply(t("commands.mod.cannotTargetBot"));
      return;
    }

    const lastAt = bot.getLastActivityAt(user.userId);
    const name = mentionUser(user, targetInput);
    if (!lastAt) {
      await reply(t("commands.mod.afktime.noRecord", { user: name }));
      return;
    }

    const duration = formatDuration(Date.now() - lastAt);
    await reply(t("commands.mod.afktime.reply", { user: name, duration }));
  },
};
