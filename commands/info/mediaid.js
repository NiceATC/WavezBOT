export default {
  name: "mediaid",
  aliases: ["songid"],
  descriptionKey: "commands.info.mediaid.description",
  usageKey: "commands.info.mediaid.usage",
  cooldown: 5000,
  deleteOn: 60_000,
  minRole: "resident_dj",

  async execute(ctx) {
    const { bot, reply, t } = ctx;
    const state = bot.getSessionState();
    const track = state.currentTrack;

    if (!track?.title) {
      await reply(t("commands.info.mediaid.noTrack"));
      return;
    }

    const trackId =
      bot.getCurrentTrackId() ?? track.sourceId ?? track.youtubeId ?? null;
    if (!trackId) {
      await reply(t("commands.info.mediaid.noId"));
      return;
    }

    await reply(t("commands.info.mediaid.reply", { id: trackId }));
  },
};
