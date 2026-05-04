import { pickRandom } from "../../helpers/random.js";
import { getRoleLevel } from "../../lib/permissions.js";
import {
  getQueueEntryUserId,
  getWaitlistPositionForIndex,
} from "../../lib/waitlist.js";

const GOOD_CHANCE = 3;
const NEUTRAL_CHANCE = 27;

function formatJailsonLine(line, name) {
  return line.replaceAll("{name}", name);
}

export default {
  name: "jailson",
  aliases: ["urso"],
  descriptionKey: "commands.fun.jailson.description",
  usageKey: "commands.fun.jailson.usage",
  cooldown: 1000_000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, api, sender, reply, t, tArray, cancelCooldown } = ctx;
    const userId = sender.userId != null ? String(sender.userId) : "";
    const name = sender.username ?? sender.displayName ?? t("common.someone");
    const tag = `@${name}`;

    if (!userId) {
      cancelCooldown?.();
      await reply(t("commands.fun.jailson.noUser"));
      return;
    }

    if (!api?.room?.getQueueStatus) {
      cancelCooldown?.();
      await reply(t("commands.fun.jailson.apiUnavailable"));
      return;
    }

    if (bot.getBotRoleLevel() < getRoleLevel("bouncer")) {
      cancelCooldown?.();
      await reply(t("commands.fun.jailson.noPermission"));
      return;
    }

    let entries = [];
    try {
      const qRes = await api.room.getQueueStatus(bot.cfg.room);
      entries = Array.isArray(qRes?.data?.entries) ? qRes.data.entries : [];
    } catch (err) {
      cancelCooldown?.();
      await reply(
        t("commands.fun.jailson.waitlistError", { error: err.message }),
      );
      return;
    }

    const queueIndex = entries.findIndex(
      (entry) => getQueueEntryUserId(entry) === userId,
    );
    const inList = getWaitlistPositionForIndex(queueIndex, entries) != null;
    if (!inList) {
      cancelCooldown?.();
      await reply(t("commands.fun.jailson.mustBeInQueue"));
      return;
    }

    const neutralEnabled = bot.cfg.funNeutralEnabled !== false;
    const roll = Math.floor(Math.random() * 100);
    if (roll < GOOD_CHANCE) {
      try {
        bot.wsReorderQueue(userId, 0);
        const msg = formatJailsonLine(
          pickRandom(tArray("commands.fun.jailson.goodLines")) ?? "",
          tag,
        );
        await reply(msg);
      } catch (err) {
        await reply(
          t("commands.fun.jailson.moveError", {
            user: tag,
            error: err.message,
          }),
        );
      }
      return;
    }

    if (neutralEnabled && roll < GOOD_CHANCE + NEUTRAL_CHANCE) {
      const msg = formatJailsonLine(
        pickRandom(tArray("commands.fun.jailson.neutralLines")) ?? "",
        tag,
      );
      await reply(msg);
      return;
    }

    try {
      bot.wsRemoveFromQueue(userId);
      const msg = formatJailsonLine(
        pickRandom(tArray("commands.fun.jailson.badLines")) ?? "",
        tag,
      );
      await reply(msg);
    } catch (err) {
      await reply(
        t("commands.fun.jailson.removeError", {
          user: tag,
          error: err.message,
        }),
      );
    }
  },
};
