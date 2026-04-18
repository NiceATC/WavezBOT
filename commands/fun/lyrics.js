import { fetchJson } from "../../helpers/http.js";

const GENIUS_BASE = "https://api.genius.com";

// Remove YouTube channel suffixes that pollute searches
function cleanArtist(artist) {
  return artist
    .replace(/VEVO$/i, "")
    .replace(/\bofficial\b/i, "")
    .replace(/\bchannel\b/i, "")
    .replace(/\btopic\b/i, "")
    .replace(/[-_]+$/, "")
    .trim();
}

export default {
  name: "lyrics",
  aliases: ["letra", "lyric"],
  descriptionKey: "commands.fun.lyrics.description",
  usageKey: "commands.fun.lyrics.usage",
  cooldown: 5000,
  deleteOn: 120_000,

  async execute(ctx) {
    const { bot, args, reply, t } = ctx;

    let query = args.join(" ").trim();

    // Sem argumento → usa a música tocando agora
    if (!query) {
      const state = bot.getSessionState();
      const track = state.currentTrack;
      if (!track?.title) {
        await reply(t("commands.fun.lyrics.noTrack"));
        return;
      }
      query = track.title;
    }

    const apiKey = process.env.GENIUS_API_KEY;
    if (!apiKey) {
      await reply(t("commands.fun.lyrics.noApiKey"));
      return;
    }

    let data;
    try {
      const url = `${GENIUS_BASE}/search?q=${encodeURIComponent(query)}&access_token=${encodeURIComponent(apiKey)}`;
      data = await fetchJson(url, 8000);
    } catch (err) {
      console.error("[lyrics] Genius API error:", err?.message ?? err);
      await reply(t("commands.fun.lyrics.error"));
      return;
    }

    if (data?.meta?.status !== 200) {
      console.error(
        "[lyrics] Genius response status:",
        data?.meta?.status,
        data?.meta?.message,
      );
      await reply(t("commands.fun.lyrics.error"));
      return;
    }

    const EXCLUDE =
      /\b(review|annotated|annotation|commentary|essay|breakdown|analysis|explained)\b/i;

    const hit =
      data?.response?.hits?.find(
        (h) =>
          h.type === "song" &&
          h.result.lyrics_state === "complete" &&
          !EXCLUDE.test(h.result.full_title),
      ) ??
      data?.response?.hits?.find(
        (h) => h.type === "song" && !EXCLUDE.test(h.result.full_title),
      );
    if (!hit) {
      await reply(t("commands.fun.lyrics.notFound", { query }));
      return;
    }

    const { full_title, id } = hit.result;
    const lyricsUrl = `https://genius.com/songs/${id}`;
    await reply(
      t("commands.fun.lyrics.result", { title: full_title, url: lyricsUrl }),
    );
  },
};
