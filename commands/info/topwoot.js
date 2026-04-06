import { listTopWootUsers } from "../../lib/storage.js";

function parseLimit(input) {
  const value = Math.floor(Number(input) || 0);
  if (!Number.isFinite(value) || value <= 0) return 5;
  return Math.max(1, Math.min(10, value));
}

export default {
  name: "topwoot",
  descriptionKey: "commands.info.topwoot.description",
  usageKey: "commands.info.topwoot.usage",
  cooldown: 8000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, args, t, reply } = ctx;
    await bot.ensureLeaderboardReset();
    const limit = parseLimit(args[0]);
    const rows = await listTopWootUsers(limit);
    if (!rows?.length) {
      await reply(t("commands.info.topwoot.empty"));
      return;
    }

    const lines = rows.map((row, index) =>
      t("commands.info.topwoot.line", {
        pos: index + 1,
        user: row.display_name ?? row.username ?? t("common.someone"),
        count: row.woots ?? 0,
      }),
    );

    await reply(t("commands.info.topwoot.reply", { lines: lines.join(" | ") }));
  },
};
