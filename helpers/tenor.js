import { fetchJson } from "./http.js";
import { pickRandom } from "./random.js";

const TENOR_BASE = "https://g.tenor.com/v1";
const TENOR_DEFAULT_KEY = "LIVDSRZULELA";
const TENOR_LIMIT = 20;

function extractTenorGifUrl(item) {
  if (!item || typeof item !== "object") return null;
  const formats = item.media_formats || item.mediaFormats || null;
  if (formats?.gif?.url) return formats.gif.url;
  if (formats?.mediumgif?.url) return formats.mediumgif.url;
  if (formats?.tinygif?.url) return formats.tinygif.url;

  const media = Array.isArray(item.media) ? item.media[0] : null;
  if (media?.gif?.url) return media.gif.url;
  if (media?.mediumgif?.url) return media.mediumgif.url;
  if (media?.tinygif?.url) return media.tinygif.url;
  return null;
}

export async function fetchTenorGif(query) {
  const key =
    process.env.TENOR_API_KEY || process.env.GIF_API_KEY || TENOR_DEFAULT_KEY;
  const encodedKey = encodeURIComponent(key);
  const encodedQuery = encodeURIComponent(query || "");
  const endpoint = query
    ? `${TENOR_BASE}/search?q=${encodedQuery}&key=${encodedKey}&limit=${TENOR_LIMIT}&media_filter=gif`
    : `${TENOR_BASE}/trending?key=${encodedKey}&limit=${TENOR_LIMIT}&media_filter=gif`;

  const data = await fetchJson(endpoint);
  const results = Array.isArray(data?.results) ? data.results : [];
  if (!results.length) return null;
  const pick = pickRandom(results);
  return extractTenorGifUrl(pick);
}
