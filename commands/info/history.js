import { listTrackHistory } from "../../lib/storage.js";

function formatLabel(title, artist) {
  if (artist) return `${artist} - ${title}`;
  return title;
}

export default {
  name: "history",
  descriptionKey: "commands.history.description",
  usageKey: "commands.history.usage",
  cooldown: 6000,

  async execute(ctx) {
    const { t, reply } = ctx;
    const rows = await listTrackHistory(5);
    if (!rows?.length) {
      await reply(t("commands.history.empty"));
      return;
    }

    const lines = rows.map((entry, index) => {
      const title = entry.title ?? t("common.song");
      const artist = entry.artist ?? "";
      const label = formatLabel(title, artist);
      const dj = entry.dj_name ?? t("common.someone");
      return t("commands.history.line", {
        pos: index + 1,
        label,
        dj,
      });
    });

    await reply(t("commands.history.reply", { lines: lines.join(" | ") }));
  },
};
