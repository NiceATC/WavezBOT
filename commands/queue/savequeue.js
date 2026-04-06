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
      const res = await api.room.getWaitlist(bot.cfg.room);
      const waitlist = res?.data?.data?.waitlist ?? res?.data?.waitlist ?? [];
      if (!Array.isArray(waitlist) || waitlist.length === 0) {
        await reply(t("commands.queue.savequeue.empty"));
        return;
      }
      const entries = waitlist.map((u, idx) => ({
        userId: u.id ?? u.userId ?? u.user_id,
        username: u.username ?? null,
        displayName: u.displayName ?? u.display_name ?? null,
        position: idx + 1,
      }));
      await upsertWaitlistSnapshot(entries);
      await reply(
        t("commands.queue.savequeue.saved", {
          count: entries.length,
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
