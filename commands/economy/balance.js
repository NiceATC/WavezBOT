import { formatPoints } from "../../helpers/points.js";
import { renderBalanceCard } from "../../helpers/profile-card.js";
import { uploadToImgbb } from "../../helpers/imgbb.js";

export default {
  name: "balance",
  aliases: ["bal", "saldo"],
  descriptionKey: "commands.balance.description",
  usageKey: "commands.balance.usage",
  cooldown: 3000,

  async execute(ctx) {
    const { bot, sender, reply, t } = ctx;
    if (!bot.cfg.economyEnabled) {
      await reply(t("commands.balance.disabled"));
      return;
    }

    const userId = sender.userId;
    if (userId == null) {
      await reply(t("commands.balance.noUser"));
      return;
    }

    const identity = bot._getUserIdentity(userId, sender);
    const balance = await bot.getEconomyBalance(userId, identity);

    if (bot.cfg.imageRenderingEnabled && process.env.IMGBB_API_KEY) {
      try {
        const labels = {
          title: t("commands.balance.cardTitle"),
          balance: t("commands.balance.cardBalance"),
          points: t("commands.balance.cardPoints"),
        };
        const buffer = renderBalanceCard({
          username: identity.displayName ?? identity.username ?? "User",
          balance,
          labels,
        });
        const url = await uploadToImgbb(buffer, `balance-${userId}`);
        await reply(url);
        return;
      } catch {
        // fall back to text
      }
    }

    await reply(
      t("commands.balance.reply", {
        balance: formatPoints(balance),
      }),
    );
  },
};
