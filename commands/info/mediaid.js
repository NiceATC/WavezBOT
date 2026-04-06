export default {
  name: "mediaid",
  aliases: ["songid"],
  descriptionKey: "commands.mediaid.description",
  usageKey: "commands.mediaid.usage",
  cooldown: 5000,
  minRole: "resident_dj",

  async execute(ctx) {
    const { bot, reply, t } = ctx;
    const state = bot.getSessionState();
    const track = state.currentTrack;

    if (!track?.title) {
      await reply(t("commands.mediaid.noTrack"));
      return;
    }

    const trackId =
      bot.getCurrentTrackId() ?? track.sourceId ?? track.youtubeId ?? null;
    if (!trackId) {
      await reply(t("commands.mediaid.noId"));
      return;
    }

    await reply(t("commands.mediaid.reply", { id: trackId }));
  },
};
