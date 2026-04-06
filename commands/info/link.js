const YOUTUBE_SOURCES = new Set(["youtube", "yt", "ytmusic", "youtubemusic"]);

function isYoutubeSource(source) {
  const normalized = String(source ?? "").toLowerCase();
  if (!normalized) return true;
  if (YOUTUBE_SOURCES.has(normalized)) return true;
  return normalized.includes("youtube");
}

function buildTrackLink(track) {
  const direct = track?.link;
  if (direct) return String(direct);

  const sourceId = track?.sourceId ?? track?.youtubeId ?? null;
  if (!sourceId) return null;

  if (isYoutubeSource(track?.source)) {
    return `https://www.youtube.com/watch?v=${sourceId}`;
  }

  return null;
}

export default {
  name: "link",
  aliases: ["songlink"],
  descriptionKey: "commands.info.link.description",
  usageKey: "commands.info.link.usage",
  cooldown: 5000,
  deleteOn: 60_000,
  minRole: "resident_dj",

  async execute(ctx) {
    const { bot, reply, t } = ctx;
    const state = bot.getSessionState();
    const track = state.currentTrack;

    if (!track?.title) {
      await reply(t("commands.info.link.noTrack"));
      return;
    }

    const url = buildTrackLink(track);
    if (!url) {
      await reply(t("commands.info.link.unavailable"));
      return;
    }

    await reply(t("commands.info.link.reply", { url }));
  },
};
