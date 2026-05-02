import {
  closeRoulette,
  openRoulette,
  rouletteState,
} from "../../helpers/roulette.js";

const { pickRandom } = await import("../../helpers/random.js");

// Map command argument → internal type key
const TYPE_ALIASES = {
  russa: "russian",
  russian: "russian",
  troll: "troll",
  destino: "destiny",
  destiny: "destiny",
};

function resolveType(arg) {
  return TYPE_ALIASES[(arg ?? "").toLowerCase().trim()] ?? "russian";
}

function alreadyOpenKey(type) {
  if (type === "troll") return "commands.fun.roulette.troll";
  if (type === "destiny") return "commands.fun.roulette.destiny";
  return "commands.fun.roulette";
}

const roulette = {
  name: "roulette",
  aliases: ["roleta"],
  descriptionKey: "commands.fun.roulette.description",
  usageKey: "commands.fun.roulette.usage",
  cooldown: 5000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { bot, api, args, reply, t, tArray } = ctx;
    if (rouletteState.open) {
      const openType = rouletteState.type ?? "russian";
      const prefix = alreadyOpenKey(openType);
      const lines =
        tArray(`${prefix}.alreadyOpenLines`) ??
        tArray("commands.fun.roulette.alreadyOpenLines") ??
        [];
      const msg =
        lines.length > 0
          ? pickRandom(lines)
          : t(`${prefix}.alreadyOpen`) ||
            t("commands.fun.roulette.alreadyOpen");
      await reply(msg);
      return;
    }

    const type = resolveType(args[0]);
    await openRoulette(bot, api, { announce: reply, type });
  },
};

const join = {
  name: "join",
  descriptionKey: "commands.fun.join.description",
  usageKey: "commands.fun.join.usage",
  cooldown: 3000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { sender, reply, api, bot, t, tArray } = ctx;
    if (!rouletteState.open) {
      await reply(t("commands.fun.join.closed"));
      return;
    }

    const key = sender.internalId ?? sender.userId ?? "";
    const name = sender.displayName ?? sender.username ?? t("common.someone");
    if (!key) {
      await reply(t("commands.fun.join.noUser"));
      return;
    }

    try {
      const qRes = await api.room.getQueueStatus(bot.cfg.room);
      const queueIds = qRes?.data?.queueUserIds ?? [];
      if (!queueIds.includes(key)) {
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
    const typePrefix = alreadyOpenKey(rouletteState.type ?? "russian");
    const lines =
      tArray(`${typePrefix}.joinedLines`) ??
      tArray("commands.fun.join.joinedLines") ??
      [];
    const msg =
      lines.length > 0
        ? pickRandom(lines).replace("{name}", name)
        : t(`${typePrefix}.joined`, { name }) ||
          t("commands.fun.join.joined", { name });
    await reply(msg);
  },
};

const leave = {
  name: "leave",
  aliases: ["sair"],
  descriptionKey: "commands.fun.leave.description",
  usageKey: "commands.fun.leave.usage",
  cooldown: 3000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { sender, reply, t, tArray } = ctx;
    if (!rouletteState.open) {
      await reply(t("commands.fun.leave.closed"));
      return;
    }

    const key = sender.internalId ?? sender.userId ?? "";
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
    const typePrefix = alreadyOpenKey(rouletteState.type ?? "russian");
    const lines =
      tArray(`${typePrefix}.leftLines`) ??
      tArray("commands.fun.leave.leftLines") ??
      [];
    const msg =
      lines.length > 0
        ? pickRandom(lines).replace("{name}", name)
        : t(`${typePrefix}.left`, { name }) ||
          t("commands.fun.leave.left", { name });
    await reply(msg);
  },
};

export default [roulette, join, leave];
