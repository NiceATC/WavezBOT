/**
 * commands/dc.js
 *
 * !dc [usuario] - restaura a posicao do usuario na fila se o DC foi recente
 */

import { getWaitlistSnapshot } from "../../lib/storage.js";
import { ROLE_LEVELS } from "../../lib/permissions.js";

const DC_MIN_FALLBACK = 10;

export default {
  name: "dc",
  aliases: ["dclookup"],
  descriptionKey: "commands.queue.dc.description",
  usageKey: "commands.queue.dc.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { api, bot, args, sender, senderRoleLevel, reply, t } = ctx;
    const targetInput = (args[0] ?? sender.username ?? sender.displayName ?? "")
      .replace(/^@/, "")
      .trim();

    if (!targetInput) {
      await reply(t("commands.queue.dc.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(targetInput);
    if (!user) {
      await reply(t("commands.queue.dc.userNotFound", { user: targetInput }));
      return;
    }

    const isSelf = String(user.userId) === String(sender.userId ?? "");
    if (!isSelf && senderRoleLevel < ROLE_LEVELS.bouncer) {
      await reply(t("commands.queue.dc.noPermission"));
      return;
    }

    const snap = await getWaitlistSnapshot(user.userId);
    if (!snap) {
      await reply(t("commands.queue.dc.noSnapshot"));
      return;
    }

    const windowMin = Number(bot.cfg.dcWindowMin ?? DC_MIN_FALLBACK);
    const dcWindowMs = Math.max(1, windowMin) * 60 * 1000;
    const updatedAt = Number(snap.updated_at ?? snap.updatedAt ?? 0);
    if (!updatedAt || Date.now() - updatedAt > dcWindowMs) {
      await reply(t("commands.queue.dc.expired"));
      return;
    }

    let position = Number(snap.position ?? 0);
    if (!Number.isFinite(position) || position < 1) {
      await reply(t("commands.queue.dc.invalidPosition"));
      return;
    }

    try {
      const wlRes = await api.room.getWaitlist(bot.cfg.room);
      const wl = wlRes?.data?.data?.waitlist ?? wlRes?.data?.waitlist ?? [];
      const inList = Array.isArray(wl)
        ? wl.some((u) => String(u.id ?? u.userId) === String(user.userId))
        : false;

      if (!inList) {
        await reply(t("commands.queue.dc.mustJoin"));
        return;
      }

      if (Array.isArray(wl)) {
        const maxPos = wl.length;
        if (position > maxPos) position = maxPos;
      }

      const apiPos = position - 1;
      bot.wsReorderQueue(user.userId, apiPos);
      await reply(
        t("commands.queue.dc.moved", {
          user: user.displayName ?? user.username,
          position,
        }),
      );
    } catch (err) {
      await reply(
        t("commands.queue.dc.error", {
          error: err.message,
        }),
      );
    }
  },
};
