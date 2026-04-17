import { ensureMention } from "../../helpers/chat.js";
import { formatPoints } from "../../helpers/points.js";
import { formatDuration } from "../../helpers/time.js";
import { Events } from "../../lib/wavez-events.js";

export default {
  name: "vipJoinCheck",
  description: "Checks expired VIP status on join and offers renewal.",
  event: Events.ROOM_USER_JOIN,
  cooldown: 3000,

  async handle(ctx, data) {
    const { bot, send } = ctx;
    if (!bot.cfg.vipEnabled || !bot.cfg.vipJoinCheckEnabled) return;

    const userId = data?.userId ?? data?.user_id ?? data?.id ?? null;
    if (userId == null || bot.isBotUser(userId)) return;

    const identity = bot._getUserIdentity(userId, {
      username: data?.username ?? null,
      displayName:
        data?.displayName ?? data?.display_name ?? data?.username ?? null,
    });
    const result = await bot.checkVipJoinFlow(userId, identity);
    const tag = ensureMention(
      data?.displayName ??
        data?.display_name ??
        data?.username ??
        identity.displayName ??
        identity.username ??
        "usuario",
    );

    if (result?.action === "auto_renewed") {
      await send(
        `${tag} seu VIP foi renovado automaticamente: ${bot.localizeValue(result.plan.name)}. Novo vencimento em ${formatDuration(Math.max(0, Number(result.result?.expiresAt ?? 0) - Date.now()))}.`,
      );
      return;
    }

    if (result?.action === "prompt_renew") {
      await send(
        `${tag} seu VIP expirou, mas voce tem saldo para renovar ${bot.localizeValue(result.plan.name)} por ${formatPoints(result.priceInt)} pontos. Use !vip renew ou !vip autorenew on.`,
      );
    }
  },
};
