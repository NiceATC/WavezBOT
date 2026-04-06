import { pickRandom } from "../../helpers/random.js";
import { getWaitlist } from "../../helpers/waitlist.js";
import { getRoleLevel } from "../../lib/permissions.js";

const GOOD_CHANCE = 3;
const NEUTRAL_CHANCE = 27;

function formatThorLine(line, name) {
  return line.replaceAll("{name}", name);
}

export default {
  name: "thor",
  descriptionKey: "commands.thor.description",
  usageKey: "commands.thor.usage",
  cooldown: 1000_000,

  async execute(ctx) {
    const { bot, api, sender, reply, t, tArray } = ctx;
    const userId = sender.userId != null ? String(sender.userId) : "";
    const name = sender.username ?? sender.displayName ?? t("common.someone");
    const tag = `@${name}`;

    if (!userId) {
      await reply(t("commands.thor.noUser"));
      return;
    }

    if (!api?.room?.getWaitlist) {
      await reply(t("commands.thor.apiUnavailable"));
      return;
    }

    if (bot.getBotRoleLevel() < getRoleLevel("bouncer")) {
      await reply(t("commands.thor.noPermission"));
      return;
    }

    let waitlist = [];
    try {
      waitlist = await getWaitlist(api, bot.cfg.room);
    } catch (err) {
      await reply(t("commands.thor.waitlistError", { error: err.message }));
      return;
    }

    const inList = waitlist.some(
      (u) => String(u.id ?? u.userId ?? u.user_id ?? "") === userId,
    );
    if (!inList) {
      await reply(t("commands.thor.mustBeInQueue"));
      return;
    }

    const roll = Math.floor(Math.random() * 100);
    if (roll < GOOD_CHANCE) {
      try {
        await api.room.moveInWaitlist(bot.cfg.room, Number(userId), 0);
        const msg = formatThorLine(
          pickRandom(tArray("commands.thor.goodLines")) ?? "",
          tag,
        );
        await reply(msg);
      } catch (err) {
        await reply(
          t("commands.thor.moveError", { user: tag, error: err.message }),
        );
      }
      return;
    }

    if (roll < GOOD_CHANCE + NEUTRAL_CHANCE) {
      const msg = formatThorLine(
        pickRandom(tArray("commands.thor.neutralLines")) ?? "",
        tag,
      );
      await reply(msg);
      return;
    }

    try {
      await api.room.removeFromWaitlist(bot.cfg.room, Number(userId));
      const msg = formatThorLine(
        pickRandom(tArray("commands.thor.badLines")) ?? "",
        tag,
      );
      await reply(msg);
    } catch (err) {
      await reply(
        t("commands.thor.removeError", { user: tag, error: err.message }),
      );
    }
  },
};
