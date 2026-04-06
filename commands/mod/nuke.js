/**
 * commands/mod/nuke.js
 *
 * Deletes all cached chat messages in the room (nuke).
 * Only works on messages the bot has seen since it joined.
 */

const nuke = {
  name: "nuke",
  aliases: ["clearchat"],
  descriptionKey: "commands.mod.nuke.description",
  usageKey: "commands.mod.nuke.usage",
  cooldown: 10_000,
  deleteOn: 60_000,
  minRole: "manager",

  async execute(ctx) {
    const { bot, reply, t } = ctx;
    const count = bot.deleteAllCachedMessages();
    await reply(t("commands.mod.nuke.done", { count }));
  },
};

export default nuke;
