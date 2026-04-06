import { Events } from "../../lib/wavez-events.js";

function getDj(data) {
  return data?.dj ?? data?.currentDj ?? data?.current_dj ?? null;
}

export default {
  name: "economyDjReward",
  descriptionKey: "events.economyDj.description",
  event: Events.ROOM_DJ_ADVANCE,

  async handle(ctx, data) {
    const { bot } = ctx;
    if (!bot.cfg.economyEnabled && !bot.cfg.xpEnabled) return;

    const dj = getDj(data);
    const userId = dj?.userId ?? dj?.user_id ?? dj?.id ?? null;
    if (userId == null) return;
    if (bot.isBotUser(userId)) return;

    const identity = {
      username: dj?.username ?? null,
      displayName: dj?.displayName ?? dj?.display_name ?? null,
    };

    if (bot.cfg.economyEnabled && Number(bot.cfg.economyDjPoints) > 0) {
      await bot.awardEconomyPoints(userId, bot.cfg.economyDjPoints, identity);
    }
    if (bot.cfg.xpEnabled && Number(bot.cfg.xpDjPoints) > 0) {
      await bot.awardXp(userId, bot.cfg.xpDjPoints, identity);
    }
  },
};
