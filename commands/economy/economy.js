import balanceCmd from "./balance.js";
import transferCmd from "./transfer.js";
import topCmd from "./top.js";

const BALANCE_ALIASES = new Set(["balance", "bal", "saldo"]);
const TRANSFER_ALIASES = new Set(["transfer", "send", "pay"]);
const TOP_ALIASES = new Set(["top", "rank", "ranking"]);

export default {
  name: "economy",
  aliases: ["eco", "money"],
  descriptionKey: "commands.economy.description",
  usageKey: "commands.economy.usage",
  cooldown: 3000,

  async execute(ctx) {
    const { args, reply, t } = ctx;
    const sub = String(args[0] ?? "").toLowerCase();
    if (!sub) {
      await reply(t("commands.economy.usageMessage"));
      return;
    }

    if (BALANCE_ALIASES.has(sub)) {
      await balanceCmd.execute({ ...ctx, args: args.slice(1) });
      return;
    }

    if (TRANSFER_ALIASES.has(sub)) {
      await transferCmd.execute({ ...ctx, args: args.slice(1) });
      return;
    }

    if (TOP_ALIASES.has(sub)) {
      await topCmd.execute({ ...ctx, args: args.slice(1) });
      return;
    }

    await reply(t("commands.economy.usageMessage"));
  },
};
