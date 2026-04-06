import { listEconomyTop } from "../../lib/storage.js";
import { formatPoints } from "../../helpers/points.js";
import { sendChatChunks } from "../../helpers/chat.js";

export default {
  name: "top",
  aliases: ["rank", "ranking", "topmoney"],
  descriptionKey: "commands.economy.top.description",
  usageKey: "commands.economy.top.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, args, reply, t } = ctx;
    if (!bot.cfg.economyEnabled) {
      await reply(t("commands.economy.top.disabled"));
      return;
    }

    const limit = Math.max(1, Math.min(20, Number(args[0]) || 10));
    const rows = await listEconomyTop(limit);
    if (!rows.length) {
      await reply(t("commands.economy.top.empty"));
      return;
    }

    const lines = rows.map((row, idx) => {
      const name =
        row.display_name ??
        row.displayName ??
        row.username ??
        bot.getRoomUserDisplayName(row.user_id) ??
        row.user_id;
      return t("commands.economy.top.line", {
        pos: idx + 1,
        user: name,
        balance: formatPoints(row.balance ?? 0),
      });
    });

    await sendChatChunks(reply, lines.join(" | "));
  },
};
