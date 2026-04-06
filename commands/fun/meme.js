import { fetchJson } from "../../helpers/http.js";
import { pickRandom } from "../../helpers/random.js";

function normalizeSubreddits(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((name) => String(name ?? "").trim())
    .filter((name) => name)
    .map((name) => name.replace(/^r\//i, ""));
}

function getPostUrl(post) {
  if (post?.is_video && post?.media?.reddit_video?.fallback_url) {
    return post.media.reddit_video.fallback_url;
  }
  return post?.url_overridden_by_dest ?? post?.url ?? null;
}

function isMemeCandidate(post) {
  const url = getPostUrl(post);
  if (!url) return false;
  const hint = String(post?.post_hint ?? "").toLowerCase();
  if (["image", "hosted:video", "rich:video"].includes(hint)) return true;
  return /\.(png|jpe?g|gif|gifv|webp|mp4)$/i.test(url);
}

export default {
  name: "meme",
  descriptionKey: "commands.meme.description",
  usageKey: "commands.meme.usage",
  cooldown: 8000,

  async execute(ctx) {
    const { bot, t, reply } = ctx;
    const defaults = ["memes", "wholesomememes", "funny"];
    const list = normalizeSubreddits(bot.cfg.memeSubreddits);
    const subreddit = pickRandom(list.length ? list : defaults);

    try {
      const endpoint = `https://www.reddit.com/r/${encodeURIComponent(
        subreddit,
      )}/hot.json?limit=50`;
      const data = await fetchJson(endpoint);
      const posts = Array.isArray(data?.data?.children)
        ? data.data.children.map((child) => child?.data).filter(Boolean)
        : [];
      const candidates = posts.filter(
        (post) =>
          !post?.stickied &&
          !post?.over_18 &&
          post?.title &&
          isMemeCandidate(post),
      );
      if (!candidates.length) {
        await reply(t("commands.meme.notFound"));
        return;
      }

      const pick = pickRandom(candidates);
      const url = getPostUrl(pick);
      await reply(
        t("commands.meme.reply", {
          title: pick.title,
          url,
          subreddit,
        }),
      );
    } catch (err) {
      await reply(t("commands.meme.error", { error: err.message }));
    }
  },
};
