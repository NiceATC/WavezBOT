function splitTargets(raw) {
  if (!raw) return [];
  return raw
    .split(/\s*(?:\+|\/|&|,)\s*|\s+x\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolveName(bot, input) {
  if (!input) return null;
  const user = bot.findRoomUser(input);
  return user?.displayName ?? user?.username ?? input;
}

export default {
  name: "ship",
  aliases: ["love", "casal"],
  descriptionKey: "commands.fun.ship.description",
  usageKey: "commands.fun.ship.usage",
  cooldown: 4000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, sender, t, reply } = ctx;
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
    await reply(
      t("commands.fun.ship.reply", {
        left,
        right,
        percent,
      }),
    );
  },
};
