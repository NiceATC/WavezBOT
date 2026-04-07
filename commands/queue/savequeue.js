/**
 * commands/savequeue.js
 *
 * !savequeue - salva a fila atual (usuarios e posicoes)
 */

import { upsertWaitlistSnapshot } from "../../lib/storage.js";

export default {
  name: "savequeue",
  aliases: ["savewl", "savefila", "cachefila"],
  descriptionKey: "commands.queue.savequeue.description",
  usageKey: "commands.queue.savequeue.usage",
  cooldown: 5000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { api, bot, reply, t } = ctx;
    try {
      const qRes = await api.room.getQueueStatus(bot.cfg.room);
      const entries = qRes?.data?.entries ?? [];
      if (entries.length === 0) {
        await reply(t("commands.queue.savequeue.empty"));
        return;
      }
      const rows = entries
        .filter((e) => !e.isCurrentDj)
        .map((e) => ({
          userId: e.publicId ?? e.internalId ?? null,
          username: e.username ?? null,
          displayName: e.displayName ?? e.username ?? null,
          position: e.position ?? e.index + 1,
        }))
        .filter((e) => e.userId != null);
      await upsertWaitlistSnapshot(rows);
      await reply(
        t("commands.queue.savequeue.saved", {
          count: rows.length,
        }),
      );
    } catch (err) {
      await reply(
        t("commands.queue.savequeue.error", {
          error: err.message,
        }),
      );
    }
  },
};
