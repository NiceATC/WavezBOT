/**
 * commands/stats.js
 *
 * !stats — show bot session statistics
 */

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default {
  name: "stats",
  aliases: ["status", "info", "bot"],
  descriptionKey: "commands.stats.description",
  usageKey: "commands.stats.usage",
  cooldown: 8_000,

  async execute(ctx) {
    const { bot, reply, t } = ctx;
    const s = bot.getSessionState();

    if (!s.startedAt) {
      await reply(t("commands.stats.notReady"));
      return;
    }

    const uptime = formatUptime(s.uptimeSec);
    const parts = [
      t("commands.stats.uptime", { uptime }),
      t("commands.stats.woots", { count: s.wootCount }),
    ];

    if (s.waitlistPosition) {
      parts.push(
        t("commands.stats.queue", {
          position: s.waitlistPosition,
          total: s.waitlistTotal ?? "?",
        }),
      );
    }

    await reply(parts.join("  •  "));
  },
};
