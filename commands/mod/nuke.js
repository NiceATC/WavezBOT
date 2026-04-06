/**
 * commands/mod/nuke.js
 *
 * Deletes all cached chat messages in the room (nuke).
 * Only works on messages the bot has seen since it joined.
 */

const nuke = {
  name: "nuke",
  aliases: ["clearchat"],
  descriptionKey: "commands.nuke.description",
  usageKey: "commands.nuke.usage",
  cooldown: 10_000,
  minRole: "manager",

  async execute(ctx) {
    const { bot, reply, t } = ctx;
    const count = bot.deleteAllCachedMessages();
    await reply(t("commands.nuke.done", { count }));
  },
};

export default nuke;
