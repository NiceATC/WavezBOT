function splitTargets(raw) {
  if (!raw) return [];
  return raw
    .split(/\s*(?:\+|\/|&|,)\s*|\s+x\s+|\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolveName(bot, input) {
  if (!input) return null;
  const clean = input.replace(/^@/, "");
  const user = bot.findRoomUser(clean);
  return user?.displayName ?? user?.username ?? clean;
}

function shipBar(percent) {
  const filled = Math.round(percent / 10);
  return "[" + "█".repeat(filled) + "░".repeat(10 - filled) + "]";
}

function shipEmoji(percent) {
  if (percent >= 90) return "💞";
  if (percent >= 70) return "❤️";
  if (percent >= 50) return "💛";
  if (percent >= 30) return "🤝";
  return "💔";
}

function shipTier(percent) {
  if (percent >= 90) return "max";
  if (percent >= 70) return "high";
  if (percent >= 50) return "mid";
  if (percent >= 30) return "low";
  return "min";
}

export default {
  name: "ship",
  aliases: ["love", "casal"],
  descriptionKey: "commands.fun.ship.description",
  usageKey: "commands.fun.ship.usage",
  cooldown: 4000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, sender, t, tArray, reply } = ctx;
    const raw = String(ctx.rawArgs ?? "").trim();
    const parts = splitTargets(raw);
    const senderName =
      sender.displayName ?? sender.username ?? t("common.someone");

    let left;
    let right;

    if (parts.length >= 2) {
      left = resolveName(bot, parts[0]);
      right = resolveName(bot, parts[1]);
    } else if (parts.length === 1) {
      left = senderName;
      right = resolveName(bot, parts[0]);
    } else {
      left = senderName;
      right = t("common.someone");
    }

    const percent = Math.floor(Math.random() * 101);
    const bar = shipBar(percent);
    const emoji = shipEmoji(percent);
    const tier = shipTier(percent);
    const messages = tArray("commands.fun.ship.messages." + tier);
    const message = Array.isArray(messages)
      ? messages[Math.floor(Math.random() * messages.length)]
      : "";

    await reply(
      t("commands.fun.ship.reply", {
        left,
        right,
        percent,
        bar,
        emoji,
        message,
      }),
    );
  },
};
