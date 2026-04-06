/**
 * events/timeGuard.js
 *
 * Skips tracks longer than maxSongLengthMin when enabled.
 */

import { Events } from "../../lib/wavez-events.js";
import { getRoleLevel } from "../../lib/permissions.js";

export default {
  name: "timeGuard",
  descriptionKey: "events.timeGuard.description",
  event: Events.ROOM_DJ_ADVANCE,

  async handle(ctx, data) {
    const { bot, t } = ctx;
    if (!bot.cfg.timeGuardEnabled) return;

    const maxMin = Number(bot.cfg.maxSongLengthMin) || 0;
    if (maxMin <= 0) return;

    const media =
      data?.media ?? data?.currentMedia ?? data?.current_media ?? {};
    const duration = Number(media.duration ?? media.length ?? 0);
    if (!Number.isFinite(duration) || duration <= 0) return;

    if (duration <= maxMin * 60) return;

    if (bot.getBotRoleLevel() < getRoleLevel("bouncer")) return;

    const title = media.title ?? bot._currentTrack?.title ?? t("common.song");
    const artist =
      media.artist ?? media.artistName ?? bot._currentTrack?.artist ?? "";
    const label = artist ? `${artist} - ${title}` : title;
    const mins = Math.ceil(duration / 60);

    await bot.safeSkip({
      message: t("events.timeGuard.skip", {
        minutes: mins,
        label,
      }),
      deleteMs: bot.cfg.deleteCommandMessagesDelayMs || 60_000,
    });
  },
};
