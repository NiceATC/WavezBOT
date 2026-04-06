import { getUserWootRank, getUserDjRank } from "../../lib/storage.js";

export default {
  name: "rank",
  descriptionKey: "commands.rank.description",
  usageKey: "commands.rank.usage",
  cooldown: 8000,

  async execute(ctx) {
    const { bot, sender, t, reply } = ctx;
    const targetInput = String(ctx.rawArgs ?? "")
      .replace(/^@/, "")
      .trim();

    let userId = sender.userId;
    let name = sender.displayName ?? sender.username ?? t("common.someone");

    if (targetInput) {
      const user = bot.findRoomUser(targetInput);
      if (!user) {
        await reply(t("commands.rank.userNotFound", { user: targetInput }));
        return;
      }
      userId = user.userId;
      name = user.displayName ?? user.username ?? targetInput;
    }

    if (userId == null) {
      await reply(t("commands.rank.noUser"));
      return;
    }

    await bot.ensureLeaderboardReset();
    const woot = await getUserWootRank(userId);
    const dj = await getUserDjRank(userId);

    if (!woot && !dj) {
      await reply(t("commands.rank.empty", { user: name }));
      return;
    }

    const parts = [];
    if (woot) {
      parts.push(
        t("commands.rank.wootLine", {
          rank: woot.rank,
          count: woot.count,
        }),
      );
    }
    if (dj) {
      parts.push(
        t("commands.rank.djLine", {
          rank: dj.rank,
          count: dj.count,
        }),
      );
    }

    await reply(
      t("commands.rank.reply", { user: name, stats: parts.join("  •  ") }),
    );
  },
};
