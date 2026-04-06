/**
 * commands/blacklist.js
 *
 * !blacklist add [current|source:id]
 * !blacklist remove <current|source:id>
 * !blacklist list [limite]
 * !blacklist info
 */
import {
  addTrackBlacklist,
  removeTrackBlacklist,
  listTrackBlacklist,
  getTrackBlacklist,
} from "../../lib/storage.js";

function splitTrackId(trackId) {
  const parts = String(trackId).split(":");
  if (parts.length < 2) return { source: null, sourceId: null };
  const source = parts[0];
  const sourceId = parts.slice(1).join(":");
  return { source, sourceId };
}

export default {
  name: "blacklist",
  aliases: ["bl"],
  descriptionKey: "commands.music.blacklist.description",
  usageKey: "commands.music.blacklist.usage",
  cooldown: 3000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { args, reply, bot, api, t } = ctx;
    const action = (args[0] ?? "").toLowerCase();

    if (!action) {
      await reply(t("commands.music.blacklist.usageMessage"));
      return;
    }

    if (action === "info") {
      const id = bot.getCurrentTrackId();
      const title = bot._currentTrack?.title ?? null;
      const artist = bot._currentTrack?.artist ?? null;
      if (!id) {
        await reply(t("commands.music.blacklist.noTrackInfo"));
        return;
      }
      const label = artist
        ? `${artist} - ${title}`
        : (title ?? t("common.song"));
      await reply(
        t("commands.music.blacklist.currentInfo", {
          label,
          id,
        }),
      );
      return;
    }

    if (action === "add") {
      let trackId = args[1] ?? "current";
      if (trackId === "current") {
        trackId = bot.getCurrentTrackId();
      }
      if (!trackId) {
        await reply(t("commands.music.blacklist.noTrackAdd"));
        return;
      }

      const currentId = bot.getCurrentTrackId();
      const isCurrent = trackId === currentId;

      const existing = await getTrackBlacklist(trackId);
      if (existing) {
        await reply(t("commands.music.blacklist.already"));
        return;
      }

      const { source, sourceId } = splitTrackId(trackId);
      const title = isCurrent ? (bot._currentTrack?.title ?? null) : null;
      const artist = isCurrent ? (bot._currentTrack?.artist ?? null) : null;

      await addTrackBlacklist({
        trackId,
        source,
        sourceId,
        title,
        artist,
        addedAt: Date.now(),
      });

      if (isCurrent) {
        try {
          await reply(t("commands.music.blacklist.addedSkip"));
          await bot.safeSkip();
        } catch (err) {
          await reply(
            t("commands.music.blacklist.addedSkipError", {
              error: err.message,
            }),
          );
        }
        return;
      }

      await reply(t("commands.music.blacklist.added"));
      return;
    }

    if (action === "remove") {
      let trackId = args[1] ?? "";
      if (trackId === "current") {
        trackId = bot.getCurrentTrackId() ?? "";
      }
      if (!trackId) {
        await reply(t("commands.music.blacklist.removeUsage"));
        return;
      }
      await removeTrackBlacklist(trackId);
      await reply(t("commands.music.blacklist.removed"));
      return;
    }

    if (action === "list") {
      const limit = Math.max(1, Math.min(50, Number(args[1]) || 10));
      const list = await listTrackBlacklist(limit);
      if (!list.length) {
        await reply(t("commands.music.blacklist.empty"));
        return;
      }
      const items = list.map((t) => t.track_id ?? t.trackId);
      await reply(
        t("commands.music.blacklist.list", {
          limit,
          items: items.join(", "),
        }),
      );
      return;
    }

    await reply(t("commands.music.blacklist.invalidAction"));
  },
};
