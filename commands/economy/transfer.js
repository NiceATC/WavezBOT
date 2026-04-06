import { formatPoints, toPointsInt } from "../../helpers/points.js";

function parseAmount(input) {
  const raw = String(input ?? "")
    .trim()
    .replace(",", ".");
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

export default {
  name: "transfer",
  aliases: ["pay", "send"],
  descriptionKey: "commands.transfer.description",
  usageKey: "commands.transfer.usage",
  cooldown: 3000,

  async execute(ctx) {
    const { bot, sender, args, reply, t } = ctx;
    if (!bot.cfg.economyEnabled) {
      await reply(t("commands.transfer.disabled"));
      return;
    }

    if (sender.userId == null) {
      await reply(t("commands.transfer.noUser"));
      return;
    }

    const targetInput = String(args[0] ?? "")
      .replace(/^@/, "")
      .trim();
    const amountRaw = args[1];
    if (!targetInput || amountRaw == null) {
      await reply(t("commands.transfer.usageMessage"));
      return;
    }

    const amount = parseAmount(amountRaw);
    if (amount == null || amount <= 0) {
      await reply(t("commands.transfer.invalidAmount"));
      return;
    }

    const amountInt = toPointsInt(amount);
    const minInt = toPointsInt(bot.cfg.economyTransferMin ?? 1);
    if (amountInt < minInt) {
      await reply(
        t("commands.transfer.minAmount", {
          min: formatPoints(minInt),
        }),
      );
      return;
    }

    const target = bot.findRoomUser(targetInput);
    if (!target) {
      await reply(t("commands.transfer.userNotFound", { user: targetInput }));
      return;
    }

    if (bot.isBotUser(target.userId)) {
      await reply(t("commands.transfer.cannotTargetBot"));
      return;
    }

    if (String(target.userId) === String(sender.userId ?? "")) {
      await reply(t("commands.transfer.self"));
      return;
    }

    const identityFrom = bot._getUserIdentity(sender.userId, sender);
    const identityTo = {
      username: target.username ?? null,
      displayName: target.displayName ?? null,
    };

    const currentBalance = await bot.getEconomyBalance(
      sender.userId,
      identityFrom,
    );
    if (currentBalance < amountInt) {
      await reply(
        t("commands.transfer.insufficient", {
          balance: formatPoints(currentBalance),
        }),
      );
      return;
    }

    const result = await bot.transferEconomyPoints(
      sender.userId,
      target.userId,
      amountInt,
      identityFrom,
      identityTo,
    );

    if (!result) {
      await reply(t("commands.transfer.failed"));
      return;
    }

    await reply(
      t("commands.transfer.success", {
        user: target.displayName ?? target.username ?? targetInput,
        amount: formatPoints(amountInt),
        balance: formatPoints(result.fromBalance),
      }),
    );
  },
};
