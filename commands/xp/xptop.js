import { listXpTop } from "../../lib/storage.js";
import { formatPoints } from "../../helpers/points.js";
import { sendChatChunks } from "../../helpers/chat.js";

export default {
  name: "xptop",
  aliases: ["topxp", "rankxp"],
  descriptionKey: "commands.xp.xptop.description",
  usageKey: "commands.xp.xptop.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, args, reply, t } = ctx;
    if (!bot.cfg.xpEnabled) {
      await reply(t("commands.xp.xptop.disabled"));
      return;
    }

    const limit = Math.max(1, Math.min(20, Number(args[0]) || 10));
    const rows = await listXpTop(limit);
    if (!rows.length) {
      await reply(t("commands.xp.xptop.empty"));
      return;
    }

    const lines = rows.map((row, idx) => {
      const name =
        row.displayName ??
        row.username ??
        bot.getRoomUserDisplayName(row.userId) ??
        row.userId;
      return t("commands.xp.xptop.line", {
        pos: idx + 1,
        user: name,
        level: row.level ?? 1,
        xp: formatPoints(row.xpTotal ?? 0),
      });
    });

    await sendChatChunks(reply, lines.join(" | "));
  },
};
