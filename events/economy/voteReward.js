import { Events } from "../../lib/wavez-events.js";

function getVoteValue(data) {
  const vote = data?.vote ?? data?.direction ?? data?.value ?? data?.type;
  if (typeof vote === "number") return vote;
  const text = String(vote ?? "").toLowerCase();
  if (["woot", "up", "like", "1", "true"].includes(text)) return 1;
  if (["meh", "down", "dislike", "-1", "false"].includes(text)) return -1;
  if (data?.woot === true) return 1;
  if (data?.meh === true) return -1;
  return 0;
}

function getUserId(data) {
  const user = data?.user ?? data?.voter ?? data?.sender ?? null;
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
  name: "economyVoteReward",
  descriptionKey: "events.economyVote.description",
  event: Events.ROOM_VOTE,

  async handle(ctx, data) {
    const { bot } = ctx;
    if (!bot.cfg.economyEnabled && !bot.cfg.xpEnabled) return;

    const voteValue = getVoteValue(data);
    if (voteValue <= 0) return;

    const userId = getUserId(data);
    if (userId == null) return;
    if (bot.isBotUser(userId)) return;

    const trackId = getTrackId(bot, data);
    if (!bot._recordTrackReward(bot._economyVoteTrack, userId, trackId)) {
      return;
    }

    const identity = bot._getUserIdentity(userId, data?.user ?? data?.sender);
    if (bot.cfg.economyEnabled && Number(bot.cfg.economyWootPoints) > 0) {
      await bot.awardEconomyPoints(userId, bot.cfg.economyWootPoints, identity);
    }
    if (bot.cfg.xpEnabled && Number(bot.cfg.xpWootPoints) > 0) {
      await bot.awardXp(userId, bot.cfg.xpWootPoints, identity);
    }
  },
};
