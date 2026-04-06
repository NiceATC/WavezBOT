import { formatDuration } from "../../helpers/time.js";

export default {
  name: "afktime",
  aliases: ["afk"],
  descriptionKey: "commands.afktime.description",
  usageKey: "commands.afktime.usage",
  cooldown: 5000,
  minRole: "bouncer",

  async execute(ctx) {
    const { bot, args, sender, reply, t } = ctx;
    const targetInput = (args[0] ?? sender.username ?? sender.displayName ?? "")
      .replace(/^@/, "")
      .trim();

    if (!targetInput) {
      await reply(t("commands.afktime.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(targetInput);
    if (!user) {
      await reply(t("commands.afktime.userNotFound", { user: targetInput }));
      return;
    }

    if (bot.isBotUser(user.userId)) {
      await reply(t("commands.mod.cannotTargetBot"));
      return;
    }

    const lastAt = bot.getLastActivityAt(user.userId);
    const name = user.displayName ?? user.username ?? targetInput;
    if (!lastAt) {
      await reply(t("commands.afktime.noRecord", { user: name }));
      return;
    }

    const duration = formatDuration(Date.now() - lastAt);
    await reply(t("commands.afktime.reply", { user: name, duration }));
  },
};
