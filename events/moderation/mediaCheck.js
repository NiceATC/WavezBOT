/**
 * events/mediaCheck.js
 *
 * Checks YouTube availability/age restriction on DJ advance.
 * If blocked, skips the track and notifies the chat.
 */

import { Events } from "../../lib/wavez-events.js";
import ytdl from "@distube/ytdl-core";
import { getRoleLevel } from "../../lib/permissions.js";
import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

const YOUTUBE_SOURCES = new Set(["youtube", "yt", "ytmusic", "youtubemusic"]);
const CHECK_API_BASE = "https://yt.niceatc.api.br/check?id=";
const CHECK_API_TIMEOUT_MS = 10_000;
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

function getMediaId(media) {
  const primary =
    media?.sourceId ??
    media?.source_id ??
    media?.youtubeId ??
    media?.youtube_id ??
    media?.cid ??
    media?.videoId ??
    media?.video_id ??
    null;
  const fromPrimary = extractYouTubeId(primary);
  if (fromPrimary) return fromPrimary;

  const urlCandidate =
    media?.link ??
    media?.url ??
    media?.sourceUrl ??
    media?.source_url ??
    media?.uri ??
    media?.permalink ??
    media?.permalink_url ??
    media?.videoUrl ??
    media?.video_url ??
    null;
  return extractYouTubeId(urlCandidate);
}

function isValidYouTubeId(value) {
  return typeof value === "string" && YOUTUBE_ID_RE.test(value);
}

function extractYouTubeId(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (isValidYouTubeId(raw)) return raw;

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return isValidYouTubeId(id) ? id : null;
    }

    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const v = url.searchParams.get("v");
      if (isValidYouTubeId(v)) return v;

      const parts = url.pathname.split("/").filter(Boolean);
      if ((parts[0] === "shorts" || parts[0] === "embed") && parts[1]) {
        return isValidYouTubeId(parts[1]) ? parts[1] : null;
      }
    }
  } catch {
    // ignore invalid URLs
  }

  const match = raw.match(
    /(?:v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
  );
  return match && isValidYouTubeId(match[1]) ? match[1] : null;
}

function isYoutubeSource(media) {
  const source = String(media?.source ?? media?.platform ?? "").toLowerCase();
  if (!source) return true;
  if (YOUTUBE_SOURCES.has(source)) return true;
  return source.includes("youtube");
}

function getLabel(media, bot, t) {
  const fallback = t ? t("common.song") : (bot?.t?.("common.song") ?? "song");
  const title = media?.title ?? bot?._currentTrack?.title ?? fallback;
  const artist =
    media?.artist ??
    media?.artistName ??
    media?.artist_name ??
    bot?._currentTrack?.artist ??
    "";
  return artist ? `${artist} - ${title}` : title;
}

function getPlayability(info) {
  const ps =
    info?.player_response?.playabilityStatus ?? info?.playabilityStatus ?? {};
  const status = ps.status ?? "";
  const reason = ps.reason ?? "";
  const ageRestricted = Boolean(
    info?.videoDetails?.age_restricted ?? info?.videoDetails?.ageRestricted,
  );
  const playableInEmbed = ps.playableInEmbed;
  return {
    status: String(status),
    reason: String(reason),
    ageRestricted,
    playableInEmbed,
  };
}

async function checkWithApi(videoId, debug, t) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHECK_API_TIMEOUT_MS);
  const url = `${CHECK_API_BASE}${encodeURIComponent(videoId)}`;

  try {
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      if (debug) {
        console.log(t("events.mediaCheck.log.apiHttp", { status: res.status }));
      }
      return null;
    }

    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object") {
      if (debug) console.log(t("events.mediaCheck.log.apiInvalid"));
      return null;
    }

    const blocked = Boolean(data.blocked);
    const ageRestricted = Boolean(data.ageRestricted);
    const ageLimit = Number(data.ageLimit ?? 0);
    const availability = String(data.availability ?? "").toLowerCase();

    return { blocked, ageRestricted, ageLimit, availability };
  } catch (err) {
    if (debug) {
      const label =
        err?.name === "AbortError" ? "timeout" : (err?.message ?? err);
      console.log(t("events.mediaCheck.log.apiError", { error: label }));
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default {
  name: "mediaCheck",
  descriptionKey: "events.mediaCheck.description",
  event: Events.ROOM_DJ_ADVANCE,

  async handle(ctx, data) {
    const { bot, t } = ctx;
    const debug = Boolean(bot?.cfg?.mediaCheckDebug);
    if (bot.getBotRoleLevel() < getRoleLevel("bouncer")) return;

    const media =
      data?.media ?? data?.currentMedia ?? data?.current_media ?? {};
    if (!isYoutubeSource(media)) return;

    const videoId = getMediaId(media);
    if (!videoId) {
      if (debug) {
        console.log(
          t("events.mediaCheck.log.noId", {
            keys: Object.keys(media).join(", "),
          }),
        );
      }
      return;
    }

    if (debug) {
      const title = media?.title ?? "";
      const source = media?.source ?? media?.platform ?? "";
      console.log(
        t("events.mediaCheck.log.checking", {
          source,
          id: videoId,
          title,
        }),
      );
    }

    async function skipTrack(reasonText, detail) {
      const label = getLabel(media, bot, t);
      await bot.safeSkip({
        message: t("events.mediaCheck.skip", {
          reason: reasonText,
          detail,
          label,
        }),
        deleteMs: bot.cfg.deleteCommandMessagesDelayMs || 60_000,
      });
    }

    const url = `https://www.youtube.com/watch?v=${videoId}`;
    let info = null;
    try {
      info = await ytdl.getBasicInfo(url);
    } catch (err) {
      const msg = String(err?.message ?? "");
      if (debug) {
        console.log(t("events.mediaCheck.log.ytdlError", { error: msg }));
      }
    }

    if (info) {
      const { status, reason, ageRestricted, playableInEmbed } =
        getPlayability(info);
      const isPrivate = Boolean(info?.videoDetails?.isPrivate);
      const isPlayable = info?.videoDetails?.isPlayable;
      const restricted = ageRestricted;
      const blockedByStatus = status === "ERROR" || status === "UNPLAYABLE";
      const blockedByEmbed = playableInEmbed === false;
      const blockedByFlags = isPrivate || isPlayable === false;
      const isLoginRequired = status === "LOGIN_REQUIRED";

      if (debug) {
        console.log(
          t("events.mediaCheck.log.ytdlStatus", {
            status,
            ageRestricted,
            embeddable: playableInEmbed,
            reason,
          }),
        );
      }

      if (isLoginRequired && !restricted) {
        if (debug) {
          console.log(t("events.mediaCheck.log.ytdlLoginRequired"));
        }
      } else if (
        restricted ||
        blockedByStatus ||
        blockedByEmbed ||
        blockedByFlags
      ) {
        const reasonText = restricted
          ? t("events.mediaCheck.reason.age")
          : t("events.mediaCheck.reason.unavailable");
        const detail = reason ? ` (${reason})` : "";
        await skipTrack(reasonText, detail);
        return;
      } else if (status === "OK") {
        if (debug) console.log(t("events.mediaCheck.log.ytdlAllowed"));
        return;
      } else if (debug) {
        console.log(t("events.mediaCheck.log.ytdlInconclusive"));
      }
    }

    const apiResult = await checkWithApi(videoId, debug, t);
    if (!apiResult) {
      if (debug) console.log(t("events.mediaCheck.log.apiUnavailable"));
      return;
    }

    const availability = apiResult.availability;
    const ageLimit = apiResult.ageLimit;
    const restricted =
      apiResult.ageRestricted || (Number.isFinite(ageLimit) && ageLimit >= 18);
    const blockedByAvailability = availability && availability !== "public";
    const shouldSkip = apiResult.blocked || restricted || blockedByAvailability;

    if (debug) {
      const ageLog = Number.isFinite(ageLimit) ? ageLimit : "";
      console.log(
        t("events.mediaCheck.log.apiResult", {
          blocked: apiResult.blocked,
          ageRestricted: apiResult.ageRestricted,
          ageLimit: ageLog,
          availability,
        }),
      );
    }

    if (!shouldSkip) {
      if (debug) console.log(t("events.mediaCheck.log.apiAllowed"));
      return;
    }

    const reasonText = restricted
      ? t("events.mediaCheck.reason.age")
      : t("events.mediaCheck.reason.unavailable");
    const detail =
      blockedByAvailability && availability ? ` (${availability})` : "";
    await skipTrack(reasonText, detail);
  },
};
