import { Events } from "../../lib/wavez-events.js";

function getUserId(data) {
  const user = data?.user ?? data?.grabber ?? data?.sender ?? null;
  return (
    data?.userId ??
    data?.user_id ??
    user?.userId ??
    user?.user_id ??
    user?.id ??
    data?.id ??
    null
  );
}

function getTrackId(bot, data) {
  const media = data?.media ?? data?.currentMedia ?? data?.current_media ?? {};
  return (
    bot.getCurrentTrackId() ??
    media?.sourceId ??
    media?.source_id ??
    media?.cid ??
    media?.videoId ??
    media?.video_id ??
    null
  );
}

export default {
  name: "economyGrabReward",
  descriptionKey: "events.economyGrab.description",
  event: Events.ROOM_GRAB,

  async handle(ctx, data) {
    const { bot } = ctx;
    if (!bot.cfg.economyEnabled && !bot.cfg.xpEnabled) return;

    const userId = getUserId(data);
    if (userId == null) return;
    if (bot.isBotUser(userId)) return;

    const trackId = getTrackId(bot, data);
    if (!bot._recordTrackReward(bot._economyGrabTrack, userId, trackId)) {
      return;
    }

    const identity = bot._getUserIdentity(userId, data?.user ?? data?.sender);
    if (bot.cfg.economyEnabled && Number(bot.cfg.economyGrabPoints) > 0) {
      await bot.awardEconomyPoints(userId, bot.cfg.economyGrabPoints, identity);
    }
    if (bot.cfg.xpEnabled && Number(bot.cfg.xpGrabPoints) > 0) {
      await bot.awardXp(userId, bot.cfg.xpGrabPoints, identity);
    }
  },
};
