/**
 * commands/nowplaying.js
 *
 * !np / !nowplaying — show the currently playing track + live reactions
 */

export default {
  name: "np",
  aliases: ["nowplaying", "tocando", "musica"],
  descriptionKey: "commands.info.nowplaying.description",
  usageKey: "commands.info.nowplaying.usage",
  cooldown: 5_000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, reply, t } = ctx;
    const state = bot.getSessionState();

    if (!state.currentTrack?.title) {
      await reply(t("commands.info.nowplaying.none"));
      return;
    }

    const { title, artist } = state.currentTrack;
    const dj = state.djName ?? "?";
    const r = state.currentTrackReactions;
    const parts = [
      t("commands.info.nowplaying.trackLine", {
        title,
        artist: artist ? ` — ${artist}` : "",
      }),
      t("commands.info.nowplaying.djLine", { dj }),
    ];

    parts.push(
      t("commands.info.nowplaying.reactions", {
        woots: r.woots,
        mehs: r.mehs,
        grabs: r.grabs,
      }),
    );

    await reply(parts.join("  •  "));
  },
};
