import { formatDuration } from "../../helpers/time.js";

export default {
  name: "active",
  aliases: ["ativos"],
  descriptionKey: "commands.info.active.description",
  usageKey: "commands.info.active.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, args, reply, t } = ctx;
    const minutes = Number(args[0]);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      await reply(t("commands.info.active.usageMessage"));
      return;
    }

    const windowMin = Math.floor(minutes);
    const windowMs = windowMin * 60 * 1000;
    const count = bot.getActiveUserCount(windowMs);
    const windowLabel = formatDuration(windowMs);
    await reply(
      t("commands.info.active.reply", {
        count,
        minutes: windowMin,
        window: windowLabel,
      }),
    );
  },
};
