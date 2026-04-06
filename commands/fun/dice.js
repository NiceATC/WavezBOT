export default {
  name: "dice",
  aliases: ["dado"],
  descriptionKey: "commands.fun.dice.description",
  usageKey: "commands.fun.dice.usage",
  cooldown: 3000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { args, t, reply } = ctx;
    const raw = args[0];
    let sides = Number(raw);
    if (!Number.isFinite(sides)) sides = 6;
    sides = Math.floor(sides);

    if (sides < 2 || sides > 100) {
      await reply(t("commands.fun.dice.invalidSides"));
      return;
    }

    const roll = Math.floor(Math.random() * sides) + 1;
    await reply(t("commands.fun.dice.reply", { roll, sides }));
  },
};
