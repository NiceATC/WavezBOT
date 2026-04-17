import { listTopDjUsers } from "../../lib/storage.js";

function parseLimit(input) {
  const value = Math.floor(Number(input) || 0);
  if (!Number.isFinite(value) || value <= 0) return 5;
  return Math.max(1, Math.min(10, value));
}

export default {
  name: "topdj",
  descriptionKey: "commands.info.topdj.description",
  usageKey: "commands.info.topdj.usage",
  cooldown: 8000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, args, t, reply } = ctx;
    await bot.ensureLeaderboardReset();
    const limit = parseLimit(args[0]);
    const rows = await listTopDjUsers(limit);
    if (!rows?.length) {
      await reply(t("commands.info.topdj.empty"));
      return;
    }

    const lines = rows.map((row, index) =>
      t("commands.info.topdj.line", {
        pos: index + 1,
        user: row.displayName ?? row.username ?? t("common.someone"),
        count: row.djPlays ?? 0,
      }),
    );

    await reply(t("commands.info.topdj.reply", { lines: lines.join(" | ") }));
  },
};
