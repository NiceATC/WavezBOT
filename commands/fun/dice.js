export default {
  name: "dice",
  aliases: ["dado"],
  descriptionKey: "commands.dice.description",
  usageKey: "commands.dice.usage",
  cooldown: 3000,

  async execute(ctx) {
    const { args, t, reply } = ctx;
    const raw = args[0];
    let sides = Number(raw);
    if (!Number.isFinite(sides)) sides = 6;
    sides = Math.floor(sides);

    if (sides < 2 || sides > 100) {
      await reply(t("commands.dice.invalidSides"));
      return;
    }

    const roll = Math.floor(Math.random() * sides) + 1;
    await reply(t("commands.dice.reply", { roll, sides }));
  },
};
