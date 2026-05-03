import {
  formatPoints,
  toPointsInt,
  POINT_SCALE,
} from "../../helpers/points.js";
import {
  renderSlotsCard,
  renderRouletteCard,
} from "../../helpers/casino-card.js";
import { uploadToImgbb } from "../../helpers/imgbb.js";
import {
  getCasinoJackpot,
  incrementCasinoJackpot,
  setCasinoJackpot,
  incrementCasinoStat,
} from "../../lib/storage.js";

const casinoCooldowns = new Map();

const DEFAULT_SYMBOLS = [
  { emoji: "🍒", weight: 30, multiplier: 2 },
  { emoji: "🍋", weight: 25, multiplier: 2.5 },
  { emoji: "🍉", weight: 20, multiplier: 3 },
  { emoji: "🔔", weight: 15, multiplier: 4 },
  { emoji: "💎", weight: 10, multiplier: 6 },
];

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

function parseAmount(input) {
  const raw = String(input ?? "")
    .trim()
    .replace(",", ".");
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function normalizeSymbols(list) {
  const source = Array.isArray(list) && list.length ? list : DEFAULT_SYMBOLS;
  const items = [];
  for (const entry of source) {
    if (!entry || typeof entry !== "object") continue;
    const emoji = String(entry.emoji ?? "").trim();
    const weight = Math.max(1, Number(entry.weight) || 0);
    const multiplier = Math.max(0, Number(entry.multiplier) || 0);
    if (!emoji || !weight || !multiplier) continue;
    items.push({ emoji, weight, multiplier });
  }
  return items.length ? items : DEFAULT_SYMBOLS;
}

function pickWeighted(list) {
  const total = list.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of list) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return list[list.length - 1];
}

function getRouletteResult() {
  const number = Math.floor(Math.random() * 37);
  if (number === 0) {
    return { number, color: "green", colorHex: "#22c55e" };
  }
  if (RED_NUMBERS.has(number)) {
    return { number, color: "red", colorHex: "#ef4444" };
  }
  return { number, color: "black", colorHex: "#0f172a" };
}

function getRemainingCooldown(userId, cooldownMs) {
  const uid = String(userId ?? "");
  if (!uid) return 0;
  const last = casinoCooldowns.get(uid) ?? 0;
  const remaining = cooldownMs - (Date.now() - last);
  return remaining > 0 ? remaining : 0;
}

function bumpCooldown(userId) {
  const uid = String(userId ?? "");
  if (!uid) return;
  casinoCooldowns.set(uid, Date.now());
}

function computeMultiplier(base, bet, cfg) {
  const factor = Math.max(0, Number(cfg.casinoBetMultiplierFactor) || 0);
  const max = Math.max(1, Number(cfg.casinoMultiplierMax) || 1);
  const boost = 1 + bet * factor;
  return Math.min(max, base * boost);
}

function formatNet(intValue) {
  const sign = intValue >= 0 ? "+" : "";
  return `${sign}${formatPoints(intValue)}`;
}

export default {
  name: "casino",
  aliases: ["tigrinho", "bet"],
  descriptionKey: "commands.economy.casino.description",
  usageKey: "commands.economy.casino.usage",
  cooldown: 0,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, sender, args, reply, send, t } = ctx;
    if (!bot.cfg.economyEnabled || !bot.cfg.casinoEnabled) {
      await reply(t("commands.economy.casino.disabled"));
      return;
    }

    const userId = sender.userId;
    if (userId == null) {
      await reply(t("commands.economy.casino.noUser"));
      return;
    }

    const cooldownMs = Math.max(0, Number(bot.cfg.casinoCooldownMs) || 0);
    const remaining = getRemainingCooldown(userId, cooldownMs);
    if (remaining > 0) {
      await reply(
        t("commands.economy.casino.cooldown", {
          seconds: Math.ceil(remaining / 1000),
        }),
      );
      return;
    }

    const game = String(args[0] ?? "")
      .trim()
      .toLowerCase();
    if (!game) {
      await reply(t("commands.economy.casino.usageMessage"));
      return;
    }

    const betRaw = args[1];
    const bet = parseAmount(betRaw);
    if (bet == null || bet <= 0) {
      await reply(t("commands.economy.casino.invalidBet"));
      return;
    }

    const minBet = Number(bot.cfg.casinoMinBet ?? 1) || 1;
    const maxBet = Number(bot.cfg.casinoMaxBet ?? 100) || 100;
    if (bet < minBet) {
      await reply(
        t("commands.economy.casino.minBet", {
          min: formatPoints(toPointsInt(minBet)),
        }),
      );
      return;
    }
    if (bet > maxBet) {
      await reply(
        t("commands.economy.casino.maxBet", {
          max: formatPoints(toPointsInt(maxBet)),
        }),
      );
      return;
    }

    const identity = bot._getUserIdentity(userId, sender);
    const balance = await bot.getEconomyBalance(userId, identity);
    const betInt = toPointsInt(bet);
    if (balance < betInt) {
      await reply(
        t("commands.economy.casino.insufficient", {
          balance: formatPoints(balance),
        }),
      );
      return;
    }

    if (
      !["slots", "slot", "roleta", "roulette", "dados", "dice"].includes(game)
    ) {
      await reply(t("commands.economy.casino.usageMessage"));
      return;
    }

    if (game === "slots" || game === "slot") {
      const spent = await bot.spendEconomyPoints(userId, bet, identity);
      if (spent == null) {
        await reply(
          t("commands.economy.casino.insufficient", {
            balance: formatPoints(balance),
          }),
        );
        return;
      }

      bumpCooldown(userId);
      const symbols = normalizeSymbols(bot.cfg.casinoSlotsSymbols);
      const reels = [
        pickWeighted(symbols),
        pickWeighted(symbols),
        pickWeighted(symbols),
      ];
      const [a, b, c] = reels.map((item) => item.emoji);
      const jackpotEnabled = bot.cfg.casinoJackpotEnabled !== false;
      const jackpotSymbol =
        String(bot.cfg.casinoJackpotSymbol ?? "💎").trim() || "💎";
      let jackpotInt = jackpotEnabled ? await getCasinoJackpot() : 0;
      const jackpotHit =
        jackpotEnabled &&
        a === jackpotSymbol &&
        b === jackpotSymbol &&
        c === jackpotSymbol;

      let baseMultiplier = 0;
      if (a === b && b === c) {
        baseMultiplier = reels[0].multiplier;
      } else if (a === b || a === c || b === c) {
        baseMultiplier =
          Number(bot.cfg.casinoSlotsPairMultiplier ?? 1.2) || 1.2;
      }

      const effective = baseMultiplier
        ? computeMultiplier(baseMultiplier, bet, bot.cfg)
        : 0;
      const basePayoutInt = effective ? toPointsInt(bet * effective) : 0;
      let payoutInt = basePayoutInt;
      const jackpotWonInt = jackpotHit && basePayoutInt > 0 ? jackpotInt : 0;
      if (jackpotWonInt) {
        payoutInt = basePayoutInt + betInt + jackpotWonInt;
      }

      let netInt = payoutInt - betInt;

      if (payoutInt > 0) {
        await bot.awardEconomyPoints(userId, payoutInt / POINT_SCALE, identity);
      } else if (jackpotEnabled) {
        const share = Math.max(
          0,
          Math.min(1, Number(bot.cfg.casinoJackpotLossShare) || 0),
        );
        const addInt = toPointsInt(bet * share);
        if (addInt > 0) {
          jackpotInt = await incrementCasinoJackpot(addInt);
        }
      }

      if (jackpotWonInt && jackpotEnabled) {
        jackpotInt = 0;
        await setCasinoJackpot(0);
        netInt = payoutInt - betInt;
      }

      const didWin = payoutInt > 0;
      void incrementCasinoStat(String(userId), didWin);

      const reelsText = `${a} | ${b} | ${c}`;

      if (bot.cfg.imageRenderingEnabled && process.env.IMGBB_API_KEY) {
        try {
          const labels = {
            title: t("commands.economy.casino.slots.cardTitle"),
            subtitle: identity.displayName ?? identity.username ?? "Player",
            bet: t("commands.economy.casino.slots.cardBet"),
            win: t("commands.economy.casino.slots.cardWin"),
            net: t("commands.economy.casino.slots.cardNet"),
          };
          const buffer = renderSlotsCard({
            username: identity.displayName ?? identity.username ?? "Player",
            bet: betInt,
            reels: [a, b, c],
            win: payoutInt,
            net: netInt,
            jackpot: jackpotWonInt || jackpotInt,
            jackpotWon: Boolean(jackpotWonInt),
            labels,
          });
          const url = await uploadToImgbb(buffer, `slots-${userId}`);
          await send(url);
          return;
        } catch {
          // fall back to text
        }
      }

      if (payoutInt > 0 && jackpotWonInt) {
        await reply(
          t("commands.economy.casino.slots.jackpot", {
            reels: reelsText,
            jackpot: formatPoints(jackpotWonInt),
            win: formatPoints(payoutInt),
            net: formatNet(netInt),
          }),
        );
      } else if (payoutInt > 0) {
        await reply(
          t("commands.economy.casino.slots.win", {
            reels: reelsText,
            win: formatPoints(payoutInt),
            net: formatNet(netInt),
          }),
        );
      } else {
        await reply(
          t("commands.economy.casino.slots.lose", { reels: reelsText }),
        );
      }
      return;
    }

    if (game === "roleta" || game === "roulette") {
      const choiceRaw = String(args[2] ?? "")
        .trim()
        .toLowerCase();
      const choiceMap = {
        vermelho: "red",
        red: "red",
        preto: "black",
        black: "black",
        verde: "green",
        green: "green",
      };
      const choice = choiceMap[choiceRaw];
      if (!choice) {
        await reply(t("commands.economy.casino.roulette.usageMessage"));
        return;
      }

      const spent = await bot.spendEconomyPoints(userId, bet, identity);
      if (spent == null) {
        await reply(
          t("commands.economy.casino.insufficient", {
            balance: formatPoints(balance),
          }),
        );
        return;
      }

      bumpCooldown(userId);

      const result = getRouletteResult();
      const baseMultiplier =
        choice === "green"
          ? Number(bot.cfg.casinoRouletteGreenMultiplier ?? 14) || 14
          : choice === "red"
            ? Number(bot.cfg.casinoRouletteRedMultiplier ?? 2) || 2
            : Number(bot.cfg.casinoRouletteBlackMultiplier ?? 2) || 2;

      const win = result.color === choice;
      const rouletteFactor = Math.max(
        0,
        Number(bot.cfg.casinoRouletteBetMultiplierFactor ?? 0),
      );
      const rouletteMax = Math.max(1, Number(bot.cfg.casinoMultiplierMax) || 1);
      const effective = win
        ? Math.min(rouletteMax, baseMultiplier * (1 + bet * rouletteFactor))
        : 0;
      const payout = win ? bet * effective : 0;
      const payoutInt = toPointsInt(payout);
      const netInt = payoutInt - betInt;
      const didWin = payoutInt > 0;

      void incrementCasinoStat(String(userId), didWin);

      if (payoutInt > 0) {
        await bot.awardEconomyPoints(userId, payout, identity);
      }

      if (bot.cfg.imageRenderingEnabled && process.env.IMGBB_API_KEY) {
        try {
          const labels = {
            title: t("commands.economy.casino.roulette.cardTitle"),
            subtitle: identity.displayName ?? identity.username ?? "Player",
            bet: t("commands.economy.casino.roulette.cardBet"),
            win: t("commands.economy.casino.roulette.cardWin"),
            net: t("commands.economy.casino.roulette.cardNet"),
            pick: t("commands.economy.casino.roulette.cardPick"),
            result: t("commands.economy.casino.roulette.cardResult"),
          };
          const buffer = renderRouletteCard({
            username: identity.displayName ?? identity.username ?? "Player",
            bet: betInt,
            choice,
            number: result.number,
            color: result.colorHex,
            win: payoutInt,
            net: netInt,
            labels,
          });
          const url = await uploadToImgbb(buffer, `roulette-${userId}`);
          await send(url);
          return;
        } catch {
          // fall back to text
        }
      }

      if (payoutInt > 0) {
        await reply(
          t("commands.economy.casino.roulette.win", {
            choice: t(`commands.casino.roulette.color.${choice}`),
            result: t(`commands.casino.roulette.color.${result.color}`),
            number: result.number,
            win: formatPoints(payoutInt),
            net: formatNet(netInt),
          }),
        );
      } else {
        await reply(
          t("commands.economy.casino.roulette.lose", {
            choice: t(`commands.casino.roulette.color.${choice}`),
            result: t(`commands.casino.roulette.color.${result.color}`),
            number: result.number,
          }),
        );
      }
      return;
    }

    if (game === "dados" || game === "dice") {
      const guess = Math.floor(Number(args[2] ?? 0));
      const sides = Math.max(
        2,
        Math.min(100, Number(bot.cfg.casinoDiceSides) || 6),
      );
      if (!guess || guess < 1 || guess > sides) {
        await reply(t("commands.economy.casino.dice.usageMessage", { sides }));
        return;
      }

      const spent = await bot.spendEconomyPoints(userId, bet, identity);
      if (spent == null) {
        await reply(
          t("commands.economy.casino.insufficient", {
            balance: formatPoints(balance),
          }),
        );
        return;
      }

      bumpCooldown(userId);

      const roll = Math.floor(Math.random() * sides) + 1;
      const baseMultiplier =
        Number(bot.cfg.casinoDiceWinMultiplier ?? sides) || sides;
      const win = roll === guess;
      const effective = win
        ? computeMultiplier(baseMultiplier, bet, bot.cfg)
        : 0;
      const payout = win ? bet * effective : 0;
      const payoutInt = toPointsInt(payout);
      const netInt = payoutInt - betInt;

      if (payoutInt > 0) {
        await bot.awardEconomyPoints(userId, payout, identity);
      }

      if (payoutInt > 0) {
        void incrementCasinoStat(String(userId), true);
        await reply(
          t("commands.economy.casino.dice.win", {
            roll,
            guess,
            win: formatPoints(payoutInt),
            net: formatNet(netInt),
          }),
        );
      } else {
        void incrementCasinoStat(String(userId), false);
        await reply(
          t("commands.economy.casino.dice.lose", {
            roll,
            guess,
          }),
        );
      }
    }
  },
};
