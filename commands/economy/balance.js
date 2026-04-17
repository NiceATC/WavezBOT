import { formatPoints } from "../../helpers/points.js";
import { renderBalanceCard } from "../../helpers/profile-card.js";
import { uploadToImgbb } from "../../helpers/imgbb.js";
import { getVipLevelLabel } from "../../lib/vip.js";

export default {
  name: "balance",
  aliases: ["bal", "saldo"],
  descriptionKey: "commands.economy.balance.description",
  usageKey: "commands.economy.balance.usage",
  cooldown: 3000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, sender, reply, send, t } = ctx;
    if (!bot.cfg.economyEnabled) {
      await reply(t("commands.economy.balance.disabled"));
      return;
    }

    const userId = sender.userId;
    if (userId == null) {
      await reply(t("commands.economy.balance.noUser"));
      return;
    }

    const identity = bot._getUserIdentity(userId, sender);
    const balance = await bot.getEconomyBalance(userId, identity);
    const vipState = await bot.getVipState(userId, identity);
    const vipLabel = vipState.isActive
      ? getVipLevelLabel(vipState.levelKey, ctx.locale)
      : null;

    if (bot.cfg.imageRenderingEnabled && process.env.IMGBB_API_KEY) {
      try {
        const labels = {
          title: t("commands.economy.balance.cardTitle"),
          balance: t("commands.economy.balance.cardBalance"),
          vip: t("commands.economy.balance.cardVip"),
          points: t("commands.economy.balance.cardPoints"),
        };
        const buffer = renderBalanceCard({
          username: identity.displayName ?? identity.username ?? "User",
          balance,
          vipLabel,
          labels,
        });
        const url = await uploadToImgbb(buffer, `balance-${userId}`);
        await send(url);
        return;
      } catch {
        // fall back to text
      }
    }

    await reply(
      t("commands.economy.balance.reply", {
        balance: formatPoints(balance),
      }),
    );
  },
};
