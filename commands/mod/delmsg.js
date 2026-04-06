/**
 * commands/mod/delmsg.js
 *
 * Deletes all chat messages from a specific user.
 * Fetches the full history via the API (paginated, filtered by userId),
 * then also purges any locally cached message IDs for that user.
 *
 * Usage: !delmsg @user
 */

const BATCH_SIZE = 50;

const delmsg = {
  name: "delmsg",
  aliases: ["deletemsg", "clearmsg"],
  descriptionKey: "commands.mod.delmsg.description",
  usageKey: "commands.mod.delmsg.usage",
  cooldown: 5_000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { bot, api, args, reply, t } = ctx;
    const target = (args[0] ?? "").replace(/^@/, "").trim();
    if (!target) {
      await reply(t("commands.mod.delmsg.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(target);
    if (!user) {
      await reply(t("commands.mod.delmsg.userNotFound", { user: target }));
      return;
    }

    if (bot.isBotUser(user.userId)) {
      await reply(t("commands.mod.cannotTargetBot"));
      return;
    }

    const targetId = String(user.userId);
    let count = 0;

    // ── Fetch & delete via API history (filtered by userId) ──────────────────
    const roomId = bot.roomId ?? bot.cfg.room;
    if (api?.chat?.getMessages && api?.chat?.deleteMessage) {
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        let res;
        try {
          res = await api.chat.getMessages(roomId, offset, BATCH_SIZE);
        } catch {
          break;
        }

        const inner = res?.data?.data ?? res?.data ?? {};
        const messages = Array.isArray(inner)
          ? inner
          : (inner.messages ?? inner.data ?? []);

        if (!messages.length) break;

        for (const msg of messages) {
          const msgUserId = String(
            msg?.userId ?? msg?.user_id ?? msg?.sender?.id ?? "",
          );
          const id = msg?.id ?? msg?.messageId ?? msg?.message_id;
          if (!id || msgUserId !== targetId) continue;
          try {
            await api.chat.deleteMessage(roomId, id);
            count++;
          } catch {
            // best-effort — keep going
          }
        }

        if (messages.length < BATCH_SIZE) {
          hasMore = false;
        } else {
          offset += BATCH_SIZE;
        }
      }
    }

    // ── Also purge locally cached message IDs ────────────────────────────────
    const cached = bot.deleteMessagesFromUser(targetId);
    if (!api?.chat?.getMessages) count += cached;

    await reply(
      t("commands.mod.delmsg.done", {
        user: user.displayName ?? user.username,
        count,
      }),
    );
  },
};

export default delmsg;
