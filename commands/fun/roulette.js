import {
  closeRoulette,
  ROULETTE_DURATION_MS,
  rouletteState,
} from "../../helpers/roulette.js";
import { getWaitlist } from "../../helpers/waitlist.js";

const roulette = {
  name: "roulette",
  descriptionKey: "commands.roulette.description",
  usageKey: "commands.roulette.usage",
  cooldown: 5000,
  minRole: "bouncer",

  async execute(ctx) {
    const { bot, api, reply, t } = ctx;
    if (rouletteState.open) {
      await reply(t("commands.roulette.alreadyOpen"));
      return;
    }

    rouletteState.open = true;
    rouletteState.participants.clear();
    rouletteState.timeoutId = setTimeout(() => {
      closeRoulette(bot, api).catch(() => {});
    }, ROULETTE_DURATION_MS);

    await reply(
      t("commands.roulette.opened", {
        seconds: Math.round(ROULETTE_DURATION_MS / 1000),
      }),
    );
  },
};

const join = {
  name: "join",
  descriptionKey: "commands.join.description",
  usageKey: "commands.join.usage",
  cooldown: 3000,

  async execute(ctx) {
    const { sender, reply, api, bot, t } = ctx;
    if (!rouletteState.open) {
      await reply(t("commands.join.closed"));
      return;
    }

    const key = sender.userId != null ? String(sender.userId) : "";
    const name = sender.displayName ?? sender.username ?? t("common.someone");
    if (!key) {
      await reply(t("commands.join.noUser"));
      return;
    }

    try {
      const waitlist = await getWaitlist(api, bot.cfg.room);
      const inList = waitlist.some(
        (u) => String(u.id ?? u.userId ?? u.user_id ?? "") === key,
      );
      if (!inList) {
        await reply(t("commands.join.mustBeInQueue"));
        return;
      }
    } catch (err) {
      await reply(t("commands.join.waitlistError", { error: err.message }));
      return;
    }

    if (rouletteState.participants.has(key)) {
      await reply(t("commands.join.alreadyIn"));
      return;
    }

    rouletteState.participants.set(key, name);
    await reply(t("commands.join.joined", { name }));
  },
};

const leave = {
  name: "leave",
  descriptionKey: "commands.leave.description",
  usageKey: "commands.leave.usage",
  cooldown: 3000,

  async execute(ctx) {
    const { sender, reply, t } = ctx;
    if (!rouletteState.open) {
      await reply(t("commands.leave.closed"));
      return;
    }

    const key = sender.userId != null ? String(sender.userId) : "";
    const name = sender.displayName ?? sender.username ?? t("common.someone");
    if (!key) {
      await reply(t("commands.leave.noUser"));
      return;
    }
    if (!rouletteState.participants.has(key)) {
      await reply(t("commands.leave.notIn"));
      return;
    }

    rouletteState.participants.delete(key);
    await reply(t("commands.leave.left", { name }));
  },
};

export default [roulette, join, leave];
