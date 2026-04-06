/**
 * commands/woot.js
 *
 * !woot — manually cast a woot (upvote) for the current track.
 * Useful when AUTO_WOOT=false or as a fun command for users to cheer.
 *
 * NOTE: Only the bot account votes — this is not a way for users to vote on
 * behalf of themselves. It just triggers the bot's own vote action.
 */

export default {
  name: "woot",
  aliases: ["w", "voto", "votar"],
  descriptionKey: "commands.woot.description",
  usageKey: "commands.woot.usage",
  cooldown: 10_000,

  async execute(ctx) {
    const { bot, reply, sender, t } = ctx;

    if (!bot._currentTrack?.title) {
      await reply(t("commands.woot.noTrack"));
      return;
    }

    try {
      await bot._api.room.vote(bot.cfg.room, "woot");
      bot._wootCount++;
      await reply(
        t("commands.woot.voted", {
          title: bot._currentTrack.title,
          user: sender.username ?? t("common.you"),
        }),
      );
    } catch (err) {
      await reply(t("commands.woot.error", { error: err.message }));
    }
  },
};
