import { Events } from "../../lib/wavez-events.js";
import {
  touchBankOnlineAt,
  touchInsuranceDay,
  incrementChatCount,
} from "../../lib/storage.js";

export default {
  name: "economyChatReward",
  descriptionKey: "events.economyChat.description",
  event: Events.ROOM_CHAT_MESSAGE,

  async handle(ctx, data) {
    const { bot } = ctx;
    if (!bot.cfg.economyEnabled && !bot.cfg.xpEnabled) return;

    const message = String(data?.message ?? data?.content ?? "").trim();
    if (!message) return;

    const sender = data?.sender ?? {};
    const userId = sender.userId ?? data?.userId ?? data?.user_id ?? null;
    if (userId == null) return;
    if (bot.isBotUser(userId)) return;

    // Track last online for bank interest eligibility (fire-and-forget)
    void touchBankOnlineAt(String(userId));
    // Consume one insurance day if this is the first message of a new calendar day
    void touchInsuranceDay(String(userId));
    // Track chat count for analytics
    void incrementChatCount(String(userId));

    const prefix = bot.cfg.cmdPrefix ?? "!";
    if (prefix && message.startsWith(prefix)) return;

    const econCooldown = bot.cfg.economyEnabled
      ? Number(bot.cfg.economyChatCooldownMs ?? 0)
      : 0;
    const xpCooldown = bot.cfg.xpEnabled
      ? Number(bot.cfg.xpChatCooldownMs ?? 0)
      : 0;
    const cooldown = Math.max(econCooldown, xpCooldown);
    if (!bot._recordChatReward(userId, cooldown)) return;

    const identity = bot._getUserIdentity(userId, sender);
    if (bot.cfg.economyEnabled && Number(bot.cfg.economyChatPoints) > 0) {
      await bot.awardEconomyPoints(
        userId,
        bot.cfg.economyChatPoints,
        identity,
        {
          applyVipMultiplier: true,
          source: "chat",
        },
      );
    }
    if (bot.cfg.xpEnabled && Number(bot.cfg.xpChatPoints) > 0) {
      await bot.awardXp(userId, bot.cfg.xpChatPoints, identity);
    }
  },
};
