import { listTrackHistory } from "../../lib/storage.js";

function formatLabel(title, artist) {
  if (artist) return `${artist} - ${title}`;
  return title;
}

export default {
  name: "history",
  aliases: ["historico"],
  descriptionKey: "commands.info.history.description",
  usageKey: "commands.info.history.usage",
  cooldown: 6000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { t, reply } = ctx;
    const rows = await listTrackHistory(5);
    if (!rows?.length) {
      await reply(t("commands.info.history.empty"));
      return;
    }

    const lines = rows.map((entry, index) => {
      const title = entry.title ?? t("common.song");
      const artist = entry.artist ?? "";
      const label = formatLabel(title, artist);
      const dj = entry.dj_name ?? t("common.someone");
      return t("commands.info.history.line", {
        pos: index + 1,
        label,
        dj,
      });
    });

    await reply(t("commands.info.history.reply", { lines: lines.join(" | ") }));
  },
};
