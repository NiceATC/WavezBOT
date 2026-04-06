/**
 * commands/queue.js
 *
 * !queue / !fila — show the bot's waitlist position and next-up DJ info
 */

export default {
  name: "queue",
  aliases: ["fila", "waitlist", "position", "pos"],
  descriptionKey: "commands.info.queue.description",
  usageKey: "commands.info.queue.usage",
  cooldown: 5_000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, reply, t } = ctx;
    const s = bot.getSessionState();

    if (!s.inWaitlist || s.waitlistPosition == null) {
      await reply(t("commands.info.queue.notInQueue"));
      return;
    }

    const total = s.waitlistTotal ?? "?";
    const next = s.nextDjName
      ? t("commands.info.queue.next", { next: s.nextDjName })
      : "";
    await reply(
      t("commands.info.queue.status", {
        position: s.waitlistPosition,
        total,
        next,
      }),
    );
  },
};
