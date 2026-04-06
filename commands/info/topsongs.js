import { listTopSongs } from "../../lib/storage.js";

function parseLimit(input) {
  const value = Math.floor(Number(input) || 0);
  if (!Number.isFinite(value) || value <= 0) return 5;
  return Math.max(1, Math.min(10, value));
}

function formatLabel(title, artist) {
  if (artist) return `${artist} - ${title}`;
  return title;
}

export default {
  name: "topsongs",
  aliases: ["topsong"],
  descriptionKey: "commands.info.topsongs.description",
  usageKey: "commands.info.topsongs.usage",
  cooldown: 8000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, args, t, reply } = ctx;
    await bot.ensureLeaderboardReset();
    const limit = parseLimit(args[0]);
    const rows = await listTopSongs(limit);
    if (!rows?.length) {
      await reply(t("commands.info.topsongs.empty"));
      return;
    }

    const lines = rows.map((row, index) => {
      const title = row.title ?? t("common.song");
      const artist = row.artist ?? "";
      const label = formatLabel(title, artist);
      return t("commands.info.topsongs.line", {
        pos: index + 1,
        label,
        woots: row.woots ?? 0,
        plays: row.plays ?? 0,
      });
    });

    await reply(t("commands.info.topsongs.reply", { lines: lines.join(" | ") }));
  },
};
