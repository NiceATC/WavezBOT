import {
  closeRoulette,
  ROULETTE_DURATION_MS,
  rouletteState,
} from "../../helpers/roulette.js";
import { getWaitlist } from "../../helpers/waitlist.js";

const roulette = {
  name: "roulette",
  descriptionKey: "commands.fun.roulette.description",
  usageKey: "commands.fun.roulette.usage",
  cooldown: 5000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { bot, api, reply, t } = ctx;
    if (rouletteState.open) {
      await reply(t("commands.fun.roulette.alreadyOpen"));
      return;
    }

    rouletteState.open = true;
    rouletteState.participants.clear();
    rouletteState.timeoutId = setTimeout(() => {
      closeRoulette(bot, api).catch(() => {});
    }, ROULETTE_DURATION_MS);

    await reply(
      t("commands.fun.roulette.opened", {
        seconds: Math.round(ROULETTE_DURATION_MS / 1000),
      }),
    );
  },
};

const join = {
  name: "join",
  descriptionKey: "commands.fun.join.description",
  usageKey: "commands.fun.join.usage",
  cooldown: 3000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { sender, reply, api, bot, t } = ctx;
    if (!rouletteState.open) {
      await reply(t("commands.fun.join.closed"));
      return;
    }

    const key = sender.userId != null ? String(sender.userId) : "";
    const name = sender.displayName ?? sender.username ?? t("common.someone");
    if (!key) {
      await reply(t("commands.fun.join.noUser"));
      return;
    }

    try {
      const waitlist = await getWaitlist(api, bot.cfg.room);
      const inList = waitlist.some(
        (u) => String(u.id ?? u.userId ?? u.user_id ?? "") === key,
      );
      if (!inList) {
        await reply(t("commands.fun.join.mustBeInQueue"));
        return;
      }
    } catch (err) {
      await reply(t("commands.fun.join.waitlistError", { error: err.message }));
      return;
    }

    if (rouletteState.participants.has(key)) {
      await reply(t("commands.fun.join.alreadyIn"));
      return;
    }

    rouletteState.participants.set(key, name);
    await reply(t("commands.fun.join.joined", { name }));
  },
};

const leave = {
  name: "leave",
  descriptionKey: "commands.fun.leave.description",
  usageKey: "commands.fun.leave.usage",
  cooldown: 3000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { sender, reply, t } = ctx;
    if (!rouletteState.open) {
      await reply(t("commands.fun.leave.closed"));
      return;
    }

    const key = sender.userId != null ? String(sender.userId) : "";
    const name = sender.displayName ?? sender.username ?? t("common.someone");
    if (!key) {
      await reply(t("commands.fun.leave.noUser"));
      return;
    }
    if (!rouletteState.participants.has(key)) {
      await reply(t("commands.fun.leave.notIn"));
      return;
    }

    rouletteState.participants.delete(key);
    await reply(t("commands.fun.leave.left", { name }));
  },
};

export default [roulette, join, leave];
