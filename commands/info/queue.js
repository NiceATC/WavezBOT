/**
 * commands/queue.js
 *
 * !queue / !fila — show the bot's waitlist position and next-up DJ info
 */

export default {
  name: "queue",
  aliases: ["fila", "waitlist", "position", "pos"],
  descriptionKey: "commands.queue.description",
  usageKey: "commands.queue.usage",
  cooldown: 5_000,

  async execute(ctx) {
    const { bot, reply, t } = ctx;
    const s = bot.getSessionState();

    if (!s.inWaitlist || s.waitlistPosition == null) {
      await reply(t("commands.queue.notInQueue"));
      return;
    }

    const total = s.waitlistTotal ?? "?";
    const next = s.nextDjName
      ? t("commands.queue.next", { next: s.nextDjName })
      : "";
    await reply(
      t("commands.queue.status", {
        position: s.waitlistPosition,
        total,
        next,
      }),
    );
  },
};
