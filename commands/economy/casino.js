import {
  formatPoints,
  toPointsInt,
  POINT_SCALE,
} from "../../helpers/points.js";
import {
  renderSlotsCard,
  renderRouletteCard,
  renderDiceCard,
  renderAviatorCard,
} from "../../helpers/casino-card.js";
import { uploadToImgbb } from "../../helpers/imgbb.js";
import {
  getCasinoJackpot,
  incrementCasinoJackpot,
  setCasinoJackpot,
  incrementCasinoStat,
} from "../../lib/storage.js";

const casinoCooldowns = new Map();
let aviatorGame = null;

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

function parseAutoCashout(input) {
  const raw = String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/x$/, "");
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) && num > 1 ? num : null;
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

function getMessageIdFromResponse(res) {
  const msg =
    res?.data?.data?.message ??
    res?.data?.message ??
    res?.data?.data ??
    res?.data ??
    null;
  return (
    msg?.id ??
    msg?.messageId ??
    msg?.message_id ??
    res?.data?.messageId ??
    res?.data?.message_id ??
    null
  );
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

function getDiceBaseMultiplier(cfg, sides, diceCount) {
  const count = Math.max(1, Math.min(3, Number(diceCount) || 1));
  const keyed = Number(cfg[`casinoDice${count}CountMultiplier`]);
  if (Number.isFinite(keyed) && keyed > 0) return keyed;

  const legacy = Number(cfg.casinoDiceWinMultiplier);
  if (Number.isFinite(legacy) && legacy > 0) return legacy / count;

  return sides / count;
}

function getAviatorTickMs(cfg) {
  const raw = Number(cfg?.casinoAviatorTickMs ?? 3200);
  return Math.max(1800, Math.min(10_000, raw || 3200));
}

function getAviatorMaxMultiplier(cfg) {
  const raw = Number(cfg?.casinoAviatorMaxMultiplier ?? 10);
  return Math.max(2, raw || 10);
}

function getAviatorMinCrashMultiplier(cfg) {
  const raw = Number(cfg?.casinoAviatorMinCrashMultiplier ?? 1.05);
  return Math.max(1.01, Math.min(1.5, raw || 1.05));
}

function sampleAviatorCrashMultiplier(cfg) {
  const min = getAviatorMinCrashMultiplier(cfg);
  const max = getAviatorMaxMultiplier(cfg);
  const curve = Math.max(
    1.2,
    Number(cfg?.casinoAviatorCrashCurve ?? 2.4) || 2.4,
  );
  const u = Math.min(0.999999, Math.max(0.000001, Math.random()));

  // Heavy-tail distribution: many early crashes, but rare very high multipliers.
  const ratio = Math.pow(1 - u, 1 / curve);
  const sampled = min / ratio;
  return Number(Math.min(max, Math.max(min, sampled)).toFixed(2));
}

function getNextAviatorMultiplier(cfg, game) {
  const minStep = Math.max(
    0.04,
    Number(cfg?.casinoAviatorMinStep ?? 0.08) || 0.08,
  );
  const maxStep = Math.max(
    minStep,
    Number(cfg?.casinoAviatorMaxStep ?? 0.18) || 0.18,
  );
  const step =
    minStep + Math.random() * (maxStep - minStep) + game.tickCount * 0.01;
  return Number((game.currentMultiplier + step).toFixed(2));
}

async function updateAviatorMessage(bot, game, content) {
  const res = game.msgId
    ? await bot.editChat(game.msgId, content)
    : await bot.sendReply(content, game.triggerMessageId);
  const nextId = getMessageIdFromResponse(res);
  if (nextId) game.msgId = String(nextId);
  return res;
}

function buildAviatorFallbackText(bot, game) {
  const status = game.cashedOut
    ? bot.t("commands.economy.aviator.cardCashedOut")
    : game.crashed
      ? bot.t("commands.economy.aviator.cardCrashed")
      : bot.t("commands.economy.aviator.cardRunning");
  const parts = [
    `Aviator ${game.currentMultiplier.toFixed(2)}x`,
    status,
    `${bot.t("commands.economy.aviator.cardBet")}: ${formatPoints(game.betInt)}`,
    `${bot.t("commands.economy.aviator.cardBalance")}: ${formatPoints(game.finalBalanceInt ?? game.balanceAfterSpendInt)}`,
  ];
  if (game.gainInt == null) {
    parts.push(
      `${bot.t("commands.economy.aviator.cardAuto")}: ${game.autoCashout ? `${game.autoCashout.toFixed(2)}x` : "Manual"}`,
    );
  } else {
    parts.push(
      `${bot.t("commands.economy.aviator.cardGain")}: ${game.gainInt >= 0 ? "+" : ""}${formatPoints(game.gainInt)}`,
    );
  }
  return parts.join(" | ");
}

async function renderAviatorMessage(bot, game) {
  if (game.useImages) {
    try {
      const labels = {
        title: bot.t("commands.economy.aviator.cardTitle"),
        subtitle:
          game.identity.displayName ?? game.identity.username ?? "Player",
        bet: bot.t("commands.economy.aviator.cardBet"),
        gain: bot.t("commands.economy.aviator.cardGain"),
        balance: bot.t("commands.economy.aviator.cardBalance"),
        auto: bot.t("commands.economy.aviator.cardAuto"),
        current: bot.t("commands.economy.aviator.cardCurrent"),
        status: bot.t("commands.economy.aviator.cardStatus"),
        running: bot.t("commands.economy.aviator.cardRunning"),
        crashed: bot.t("commands.economy.aviator.cardCrashed"),
        cashedOut: bot.t("commands.economy.aviator.cardCashedOut"),
      };
      const buffer = renderAviatorCard({
        username:
          game.identity.displayName ?? game.identity.username ?? "Player",
        bet: game.betInt,
        multiplier: game.currentMultiplier,
        autoCashout: game.autoCashout,
        gain: game.gainInt,
        balance: game.finalBalanceInt ?? game.balanceAfterSpendInt,
        crashed: game.crashed,
        cashedOut: game.cashedOut,
        history: game.history,
        labels,
      });
      const url = await uploadToImgbb(buffer, `aviator-${game.userId}`);
      await updateAviatorMessage(bot, game, url);
      return;
    } catch {
      game.useImages = false;
    }
  }

  await updateAviatorMessage(bot, game, buildAviatorFallbackText(bot, game));
}

function clearAviatorTimer(game) {
  if (game?.timerId) clearTimeout(game.timerId);
  if (game) game.timerId = null;
}

async function finishAviatorCrash(bot, game) {
  clearAviatorTimer(game);
  game.active = false;
  game.crashed = true;
  game.gainInt = -game.betInt;
  game.finalBalanceInt = game.balanceAfterSpendInt;
  void incrementCasinoStat(String(game.userId), false);
  await renderAviatorMessage(bot, game);
  aviatorGame = null;
}

async function finishAviatorCashout(bot, game) {
  if (!game?.active) return false;
  clearAviatorTimer(game);
  game.active = false;
  game.cashedOut = true;

  const payout = game.bet * game.currentMultiplier;
  const payoutInt = toPointsInt(payout);
  game.gainInt = payoutInt - game.betInt;
  game.finalBalanceInt = game.balanceBeforeInt + game.gainInt;

  if (payout > 0) {
    await bot.awardEconomyPoints(game.userId, payout, game.identity);
  }

  void incrementCasinoStat(String(game.userId), true);
  await renderAviatorMessage(bot, game);
  aviatorGame = null;
  return true;
}

function scheduleNextAviatorTick(bot, game) {
  clearAviatorTimer(game);
  game.timerId = setTimeout(() => {
    tickAviator(bot).catch(async () => {
      const current = aviatorGame;
      if (!current) return;
      current.useImages = false;
      current.active = false;
      current.crashed = true;
      current.gainInt = -current.betInt;
      current.finalBalanceInt = current.balanceAfterSpendInt;
      await renderAviatorMessage(bot, current).catch(() => {});
      aviatorGame = null;
    });
  }, getAviatorTickMs(bot.cfg));
}

async function tickAviator(bot) {
  const game = aviatorGame;
  if (!game || !game.active) return;

  game.tickCount += 1;
  const nextMultiplier = getNextAviatorMultiplier(bot.cfg, game);

  if (nextMultiplier >= game.crashAt) {
    game.currentMultiplier = game.crashAt;
    game.history.push(game.crashAt);
    await finishAviatorCrash(bot, game);
    return;
  }

  game.currentMultiplier = nextMultiplier;
  game.history.push(nextMultiplier);

  if (game.autoCashout && nextMultiplier >= game.autoCashout) {
    await finishAviatorCashout(bot, game);
    return;
  }

  await renderAviatorMessage(bot, game);
  scheduleNextAviatorTick(bot, game);
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

    const game = String(args[0] ?? "")
      .trim()
      .toLowerCase();
    if (!game) {
      await reply(t("commands.economy.casino.usageMessage"));
      return;
    }

    if (game === "cashout") {
      if (!aviatorGame || !aviatorGame.active) {
        await reply(t("commands.economy.aviator.noActiveGame"));
        return;
      }
      if (String(aviatorGame.userId) !== String(userId)) {
        await reply(t("commands.economy.aviator.notOwner"));
        return;
      }
      await finishAviatorCashout(bot, aviatorGame);
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
      ![
        "slots",
        "slot",
        "roleta",
        "roulette",
        "dados",
        "dice",
        "aviator",
        "av",
      ].includes(game)
    ) {
      await reply(t("commands.economy.casino.usageMessage"));
      return;
    }

    if (game === "aviator" || game === "av") {
      if (bot.cfg.casinoAviatorEnabled === false) {
        await reply(t("commands.economy.aviator.disabled"));
        return;
      }
      if (aviatorGame?.active) {
        if (String(aviatorGame.userId) === String(userId)) {
          await reply(t("commands.economy.aviator.alreadyActive"));
          return;
        }
        await reply(t("commands.economy.aviator.busy"));
        return;
      }

      const autoCashout = args[2] == null ? null : parseAutoCashout(args[2]);
      if (args[2] != null && autoCashout == null) {
        await reply(t("commands.economy.aviator.invalidAutoCashout"));
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
      aviatorGame = {
        userId: String(userId),
        identity,
        triggerMessageId: ctx.messageId ?? null,
        msgId: null,
        active: true,
        crashed: false,
        cashedOut: false,
        useImages: Boolean(
          bot.cfg.imageRenderingEnabled && process.env.IMGBB_API_KEY,
        ),
        bet,
        betInt,
        balanceBeforeInt: balance,
        balanceAfterSpendInt: balance - betInt,
        finalBalanceInt: null,
        gainInt: null,
        currentMultiplier: 1,
        crashAt: sampleAviatorCrashMultiplier(bot.cfg),
        autoCashout,
        tickCount: 0,
        history: [1],
        timerId: null,
      };

      await renderAviatorMessage(bot, aviatorGame);
      scheduleNextAviatorTick(bot, aviatorGame);
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

      const newBalance = balance + netInt;
      const reelsText = `${a} | ${b} | ${c}`;

      if (bot.cfg.imageRenderingEnabled && process.env.IMGBB_API_KEY) {
        try {
          const labels = {
            title: t("commands.economy.casino.slots.cardTitle"),
            subtitle: identity.displayName ?? identity.username ?? "Player",
            bet: t("commands.economy.casino.slots.cardBet"),
            win: t("commands.economy.casino.slots.cardWin"),
            balance: t("commands.economy.casino.slots.cardBalance"),
          };
          const buffer = renderSlotsCard({
            username: identity.displayName ?? identity.username ?? "Player",
            bet: betInt,
            reels: [a, b, c],
            gain: netInt,
            balance: newBalance,
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
      const newBalance = balance + netInt;
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
            balance: t("commands.economy.casino.roulette.cardBalance"),
            pick: t("commands.economy.casino.roulette.cardPick"),
            result: t("commands.economy.casino.roulette.cardResult"),
          };
          const buffer = renderRouletteCard({
            username: identity.displayName ?? identity.username ?? "Player",
            bet: betInt,
            choice,
            number: result.number,
            color: result.colorHex,
            gain: netInt,
            balance: newBalance,
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
      const diceCount = Math.max(
        1,
        Math.min(3, Math.floor(Number(args[3] ?? 1))),
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

      const rolls = Array.from(
        { length: diceCount },
        () => Math.floor(Math.random() * sides) + 1,
      );
      const baseMultiplier = getDiceBaseMultiplier(bot.cfg, sides, diceCount);
      const win = rolls.includes(guess);
      const effective = win
        ? computeMultiplier(baseMultiplier, bet, bot.cfg)
        : 0;
      const payout = win ? bet * effective : 0;
      const payoutInt = toPointsInt(payout);
      const netInt = payoutInt - betInt;
      const newBalance = balance + netInt;

      if (payoutInt > 0) {
        await bot.awardEconomyPoints(userId, payout, identity);
      }

      if (bot.cfg.imageRenderingEnabled && process.env.IMGBB_API_KEY) {
        try {
          const labels = {
            title: t("commands.economy.casino.dice.cardTitle"),
            subtitle: identity.displayName ?? identity.username ?? "Player",
            bet: t("commands.economy.casino.dice.cardBet"),
            win: t("commands.economy.casino.dice.cardWin"),
            balance: t("commands.economy.casino.dice.cardBalance"),
            pick: t("commands.economy.casino.dice.cardPick"),
            result: t("commands.economy.casino.dice.cardResult"),
            dice: t("commands.economy.casino.dice.cardDice"),
          };
          const buffer = renderDiceCard({
            username: identity.displayName ?? identity.username ?? "Player",
            bet: betInt,
            guess,
            rolls,
            diceCount,
            gain: netInt,
            balance: newBalance,
            labels,
          });
          const url = await uploadToImgbb(buffer, `dice-${userId}`);
          await send(url);
          return;
        } catch {
          // fall back to text
        }
      }

      if (payoutInt > 0) {
        void incrementCasinoStat(String(userId), true);
        await reply(
          t("commands.economy.casino.dice.win", {
            rolls: rolls.join(", "),
            guess,
            dice: diceCount,
            win: formatPoints(payoutInt),
            net: formatNet(netInt),
          }),
        );
      } else {
        void incrementCasinoStat(String(userId), false);
        await reply(
          t("commands.economy.casino.dice.lose", {
            rolls: rolls.join(", "),
            guess,
            dice: diceCount,
          }),
        );
      }
    }
  },
};
