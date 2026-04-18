import { Events } from "../../lib/wavez-events.js";
import { tryAnswerQuiz, tryClaimDrop } from "../../helpers/live-events.js";

export default {
  name: "live-events",
  descriptionKey: "events.liveEvents.description",
  event: Events.ROOM_CHAT_MESSAGE,

  async handle(ctx, data) {
    const { bot } = ctx;
    const sender = {
      userId: data?.sender?.userId ?? data?.userId ?? data?.user_id ?? null,
      username: data?.sender?.username ?? data?.username ?? null,
      displayName:
        data?.sender?.displayName ??
        data?.sender?.display_name ??
        data?.displayName ??
        data?.display_name ??
        data?.username ??
        null,
    };
    if (!sender.userId || bot.isBotUser(sender.userId)) return;

    const message = String(data?.message ?? data?.content ?? "").trim();
    if (!message) return;

    if (await tryClaimDrop(bot, sender, message)) return;
    await tryAnswerQuiz(bot, sender, message);
  },
};
