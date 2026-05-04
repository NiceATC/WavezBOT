import { pickRandom } from "../../helpers/random.js";
import { getRoleLevel } from "../../lib/permissions.js";
import {
  getQueueEntryUserId,
  getWaitlistPositionForIndex,
} from "../../lib/waitlist.js";

const GOOD_CHANCE = 3;
const NEUTRAL_CHANCE = 27;

function formatThorLine(line, name) {
  return line.replaceAll("{name}", name);
}

export default {
  name: "thor",
  descriptionKey: "commands.fun.thor.description",
  usageKey: "commands.fun.thor.usage",
  cooldown: 1000_000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, api, sender, reply, t, tArray, cancelCooldown } = ctx;
    const userId = sender.userId != null ? String(sender.userId) : "";
    const name = sender.username ?? sender.displayName ?? t("common.someone");
    const tag = `@${name}`;

    if (!userId) {
      cancelCooldown?.();
      await reply(t("commands.fun.thor.noUser"));
      return;
    }

    if (!api?.room?.getQueueStatus) {
      cancelCooldown?.();
      await reply(t("commands.fun.thor.apiUnavailable"));
      return;
    }

    if (bot.getBotRoleLevel() < getRoleLevel("bouncer")) {
      cancelCooldown?.();
      await reply(t("commands.fun.thor.noPermission"));
      return;
    }

    let entries = [];
    try {
      const qRes = await api.room.getQueueStatus(bot.cfg.room);
      entries = Array.isArray(qRes?.data?.entries) ? qRes.data.entries : [];
    } catch (err) {
      cancelCooldown?.();
      await reply(t("commands.fun.thor.waitlistError", { error: err.message }));
      return;
    }

    const queueIndex = entries.findIndex(
      (entry) => getQueueEntryUserId(entry) === userId,
    );
    const inList = getWaitlistPositionForIndex(queueIndex, entries) != null;
    if (!inList) {
      cancelCooldown?.();
      await reply(t("commands.fun.thor.mustBeInQueue"));
      return;
    }

    const neutralEnabled = bot.cfg.funNeutralEnabled !== false;
    const roll = Math.floor(Math.random() * 100);
    if (roll < GOOD_CHANCE) {
      try {
        bot.wsReorderQueue(userId, 0);
        const msg = formatThorLine(
          pickRandom(tArray("commands.fun.thor.goodLines")) ?? "",
          tag,
        );
        await reply(msg);
      } catch (err) {
        await reply(
          t("commands.fun.thor.moveError", { user: tag, error: err.message }),
        );
      }
      return;
    }

    if (neutralEnabled && roll < GOOD_CHANCE + NEUTRAL_CHANCE) {
      const msg = formatThorLine(
        pickRandom(tArray("commands.fun.thor.neutralLines")) ?? "",
        tag,
      );
      await reply(msg);
      return;
    }

    try {
      bot.wsRemoveFromQueue(userId);
      const msg = formatThorLine(
        pickRandom(tArray("commands.fun.thor.badLines")) ?? "",
        tag,
      );
      await reply(msg);
    } catch (err) {
      await reply(
        t("commands.fun.thor.removeError", { user: tag, error: err.message }),
      );
    }
  },
};
