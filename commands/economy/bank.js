import { formatDuration } from "../../helpers/time.js";
import {
  formatPoints,
  POINT_SCALE,
  toPointsInt,
} from "../../helpers/points.js";
import {
  addInsuranceDays,
  applyBankDailyInterest,
  getBankBalance,
  getInsuranceDays,
  hasActiveInsurance,
  setBankBalance,
} from "../../lib/storage.js";

function parseAmount(value) {
  const num = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(num) || num <= 0) return 0;
  return toPointsInt(num);
}

const bank = {
  name: "bank",
  aliases: ["cofre"],
  descriptionKey: "commands.economy.bank.description",
  usageKey: "commands.economy.bank.usage",
  cooldown: 3000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, sender, args, reply, t } = ctx;
    if (!bot.cfg.economyEnabled || bot.cfg.bankEnabled === false) {
      await reply(t("commands.economy.bank.disabled"));
      return;
    }

    const userId = sender?.userId != null ? String(sender.userId) : "";
    if (!userId) {
      await reply(t("commands.economy.bank.noUser"));
      return;
    }

    const action = String(args[0] ?? "status")
      .trim()
      .toLowerCase();
    const identity = bot._getUserIdentity(userId, sender);

    if (["status", "saldo", "bal"].includes(action)) {
      const wallet = await bot.getEconomyBalance(userId, identity);
      const {
        balance: bankBal,
        accrued,
        lost,
        wasOnline,
      } = await applyBankDailyInterest(userId, {
        ratePerDay: Number(bot.cfg.bankInterestRatePerDay ?? 0.01),
        riskChance: Number(bot.cfg.bankRiskChance ?? 0.05),
        riskLossMin: Number(bot.cfg.bankRiskLossMin ?? 0.05),
        riskLossMax: Number(bot.cfg.bankRiskLossMax ?? 0.2),
        riskTotalLoss: bot.cfg.bankRiskTotalLoss === true,
      });

      let extra = "";
      if (accrued > 0) extra += ` (+${formatPoints(accrued)} rendimento)`;
      if (lost > 0) extra += ` (-${formatPoints(lost)} risco)`;
      if (!wasOnline && accrued === 0) extra += " (sem rendimento: offline)";

      await reply(
        t("commands.economy.bank.status", {
          wallet: formatPoints(wallet),
          bank: formatPoints(bankBal),
        }) + extra,
      );
      return;
    }

    if (["deposit", "depositar"].includes(action)) {
      const amountInt = parseAmount(args[1]);
      if (!amountInt) {
        await reply(t("commands.economy.bank.invalidAmount"));
        return;
      }

      const spent = await bot.spendEconomyPoints(
        userId,
        amountInt / POINT_SCALE,
        identity,
      );
      if (spent == null) {
        await reply(t("commands.economy.bank.insufficient"));
        return;
      }

      const bankBal = await getBankBalance(userId);
      const nextBank = bankBal + amountInt;
      await setBankBalance(userId, nextBank);
      await reply(
        t("commands.economy.bank.deposited", {
          amount: formatPoints(amountInt),
          bank: formatPoints(nextBank),
        }),
      );
      return;
    }

    if (["withdraw", "sacar"].includes(action)) {
      const amountInt = parseAmount(args[1]);
      if (!amountInt) {
        await reply(t("commands.economy.bank.invalidAmount"));
        return;
      }

      // apply pending daily interest before withdraw
      const { balance: bankBal } = await applyBankDailyInterest(userId, {
        ratePerDay: Number(bot.cfg.bankInterestRatePerDay ?? 0.01),
        riskChance: Number(bot.cfg.bankRiskChance ?? 0.05),
        riskLossMin: Number(bot.cfg.bankRiskLossMin ?? 0.05),
        riskLossMax: Number(bot.cfg.bankRiskLossMax ?? 0.2),
        riskTotalLoss: bot.cfg.bankRiskTotalLoss === true,
      });
      if (bankBal < amountInt) {
        await reply(t("commands.economy.bank.bankInsufficient"));
        return;
      }

      const nextBank = bankBal - amountInt;
      await setBankBalance(userId, nextBank);
      await bot.awardEconomyPoints(userId, amountInt / POINT_SCALE, identity, {
        applyVipMultiplier: false,
        source: "bank-withdraw",
      });
      await reply(
        t("commands.economy.bank.withdrawn", {
          amount: formatPoints(amountInt),
          bank: formatPoints(nextBank),
        }),
      );
      return;
    }

    await reply(t("commands.economy.bank.usageMessage"));
  },
};

const insurance = {
  name: "insurance",
  aliases: ["seguro"],
  descriptionKey: "commands.economy.insurance.description",
  usageKey: "commands.economy.insurance.usage",
  cooldown: 4000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, sender, args, reply, t } = ctx;
    if (!bot.cfg.economyEnabled || bot.cfg.insuranceEnabled === false) {
      await reply(t("commands.economy.insurance.disabled"));
      return;
    }

    const userId = sender?.userId != null ? String(sender.userId) : "";
    if (!userId) {
      await reply(t("commands.economy.insurance.noUser"));
      return;
    }

    const action = String(args[0] ?? "status")
      .trim()
      .toLowerCase();

    // --- status ---
    if (["status", "saldo"].includes(action)) {
      const days = await getInsuranceDays(userId);
      if (days <= 0) {
        await reply(t("commands.economy.insurance.inactive"));
        return;
      }
      await reply(t("commands.economy.insurance.active", { days }));
      return;
    }

    // --- buy <days> ---
    if (["buy", "comprar"].includes(action)) {
      const rawDays = Number(args[1] ?? 1);
      const requestedDays =
        Number.isFinite(rawDays) && rawDays > 0 ? Math.floor(rawDays) : 1;
      const maxDays = Math.max(1, Number(bot.cfg.insuranceMaxDays ?? 30) || 30);

      if (requestedDays > maxDays) {
        await reply(t("commands.economy.insurance.maxDays", { max: maxDays }));
        return;
      }

      const identity = bot._getUserIdentity(userId, sender);

      // VIP discount
      const vipState = await bot.getVipState(userId, identity);
      const vipLevel = vipState?.active
        ? (vipState.levelKey ?? "none")
        : "none";
      const vipDiscounts = {
        bronze: Number(bot.cfg.insuranceVipDiscountBronze ?? 0.1),
        silver: Number(bot.cfg.insuranceVipDiscountSilver ?? 0.2),
        gold: Number(bot.cfg.insuranceVipDiscountGold ?? 0.3),
      };
      const discountFraction = vipDiscounts[vipLevel] ?? 0;
      const pricePerDay = Math.max(
        0,
        Number(bot.cfg.insurancePricePerDay ?? 5),
      );
      const baseTotal = pricePerDay * requestedDays;
      const discounted = Math.floor(baseTotal * (1 - discountFraction));
      const totalPriceInt = toPointsInt(discounted);

      const spent = await bot.spendEconomyPoints(userId, discounted, identity, {
        allowMarriagePool: true,
      });
      if (spent == null) {
        await reply(
          t("commands.economy.insurance.insufficient", {
            price: formatPoints(totalPriceInt),
          }),
        );
        return;
      }

      const newTotal = await addInsuranceDays(userId, requestedDays);

      const discountNote =
        discountFraction > 0
          ? t("commands.economy.insurance.vipDiscount", {
              pct: Math.round(discountFraction * 100),
            })
          : "";

      await reply(
        t("commands.economy.insurance.purchased", {
          days: requestedDays,
          price: formatPoints(totalPriceInt),
          total: newTotal,
          discount: discountNote,
        }),
      );
      return;
    }

    await reply(t("commands.economy.insurance.usageMessage"));
  },
};

export default [bank, insurance];
