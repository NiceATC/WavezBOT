import { listTopDjUsers } from "../../lib/storage.js";

function parseLimit(input) {
  const value = Math.floor(Number(input) || 0);
  if (!Number.isFinite(value) || value <= 0) return 5;
  return Math.max(1, Math.min(10, value));
}

export default {
  name: "topdj",
  descriptionKey: "commands.topdj.description",
  usageKey: "commands.topdj.usage",
  cooldown: 8000,

  async execute(ctx) {
    const { bot, args, t, reply } = ctx;
    await bot.ensureLeaderboardReset();
    const limit = parseLimit(args[0]);
    const rows = await listTopDjUsers(limit);
    if (!rows?.length) {
      await reply(t("commands.topdj.empty"));
      return;
    }

    const lines = rows.map((row, index) =>
      t("commands.topdj.line", {
        pos: index + 1,
        user: row.display_name ?? row.username ?? t("common.someone"),
        count: row.plays ?? 0,
      }),
    );

    await reply(t("commands.topdj.reply", { lines: lines.join(" | ") }));
  },
};
