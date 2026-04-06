/**
 * commands/mod/lock.js
 */

const lock = {
  name: "lock",
  aliases: ["lockwl", "lockqueue", "travar"],
  descriptionKey: "commands.mod.lock.description",
  usageKey: "commands.mod.lock.usage",
  cooldown: 5_000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { api, bot, reply, t } = ctx;
    try {
      await api.room.lockWaitlist(bot.roomId);
      await reply(t("commands.mod.lock.success"));
    } catch (err) {
      await reply(t("commands.mod.lock.error", { error: err.message }));
    }
  },
};

const unlock = {
  name: "unlock",
  aliases: ["unlockwl", "unlockqueue", "destravar"],
  descriptionKey: "commands.mod.unlock.description",
  usageKey: "commands.mod.unlock.usage",
  cooldown: 5_000,
  deleteOn: 60_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { api, bot, reply, t } = ctx;
    try {
      await api.room.unlockWaitlist(bot.roomId);
      await reply(t("commands.mod.unlock.success"));
    } catch (err) {
      await reply(t("commands.mod.unlock.error", { error: err.message }));
    }
  },
};

export default [lock, unlock];
