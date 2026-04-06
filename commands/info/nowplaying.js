/**
 * commands/nowplaying.js
 *
 * !np / !nowplaying — show the currently playing track + live reactions
 */

export default {
  name: "np",
  aliases: ["nowplaying", "tocando", "musica"],
  descriptionKey: "commands.nowplaying.description",
  usageKey: "commands.nowplaying.usage",
  cooldown: 5_000,

  async execute(ctx) {
    const { bot, reply, t } = ctx;
    const state = bot.getSessionState();

    if (!state.currentTrack?.title) {
      await reply(t("commands.nowplaying.none"));
      return;
    }

    const { title, artist } = state.currentTrack;
    const dj = state.djName ?? "?";
    const r = state.currentTrackReactions;
    const parts = [
      t("commands.nowplaying.trackLine", {
        title,
        artist: artist ? ` — ${artist}` : "",
      }),
      t("commands.nowplaying.djLine", { dj }),
    ];

    parts.push(
      t("commands.nowplaying.reactions", {
        woots: r.woots,
        mehs: r.mehs,
        grabs: r.grabs,
      }),
    );

    await reply(parts.join("  •  "));
  },
};
