import { listTrackHistory } from "../../lib/storage.js";

function formatLabel(title, artist) {
  if (artist) return `${artist} - ${title}`;
  return title;
}

export default {
  name: "lastplayed",
  aliases: ["lp"],
  descriptionKey: "commands.info.lastplayed.description",
  usageKey: "commands.info.lastplayed.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { t, reply } = ctx;
    const rows = await listTrackHistory(1);
    const entry = rows?.[0];
    if (!entry) {
      await reply(t("commands.info.lastplayed.empty"));
      return;
    }

    const title = entry.title ?? t("common.song");
    const artist = entry.artist ?? "";
    const label = formatLabel(title, artist);
    const dj = entry.dj_name ?? t("common.someone");

    await reply(t("commands.info.lastplayed.reply", { label, dj }));
  },
};
