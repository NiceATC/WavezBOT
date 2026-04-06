/**
 * commands/mod/lock.js
 */

const lock = {
  name: "lock",
  aliases: ["lockwl", "lockqueue", "travar"],
  descriptionKey: "commands.lock.description",
  usageKey: "commands.lock.usage",
  cooldown: 5_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { api, bot, reply, t } = ctx;
    try {
      await api.room.lockWaitlist(bot.cfg.room);
      await reply(t("commands.lock.success"));
    } catch (err) {
      await reply(t("commands.lock.error", { error: err.message }));
    }
  },
};

const unlock = {
  name: "unlock",
  aliases: ["unlockwl", "unlockqueue", "destravar"],
  descriptionKey: "commands.unlock.description",
  usageKey: "commands.unlock.usage",
  cooldown: 5_000,
  minRole: "bouncer",

  async execute(ctx) {
    const { api, bot, reply, t } = ctx;
    try {
      await api.room.unlockWaitlist(bot.cfg.room);
      await reply(t("commands.unlock.success"));
    } catch (err) {
      await reply(t("commands.unlock.error", { error: err.message }));
    }
  },
};

export default [lock, unlock];
