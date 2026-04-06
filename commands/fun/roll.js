function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default {
  name: "roll",
  aliases: ["random"],
  descriptionKey: "commands.roll.description",
  usageKey: "commands.roll.usage",
  cooldown: 3000,

  async execute(ctx) {
    const { args, t, reply } = ctx;
    const maxRange = 1_000_000;

    let min = 1;
    let max = 100;

    if (args.length === 1) {
      const parsed = parseNumber(args[0]);
      if (parsed == null) {
        await reply(t("commands.roll.usageMessage"));
        return;
      }
      max = parsed;
    } else if (args.length >= 2) {
      const parsedMin = parseNumber(args[0]);
      const parsedMax = parseNumber(args[1]);
      if (parsedMin == null || parsedMax == null) {
        await reply(t("commands.roll.usageMessage"));
        return;
      }
      min = parsedMin;
      max = parsedMax;
    }

    if (
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      min > max ||
      Math.abs(min) > maxRange ||
      Math.abs(max) > maxRange
    ) {
      await reply(t("commands.roll.usageMessage"));
      return;
    }

    const roll = Math.floor(Math.random() * (max - min + 1)) + min;
    await reply(t("commands.roll.reply", { roll, min, max }));
  },
};
