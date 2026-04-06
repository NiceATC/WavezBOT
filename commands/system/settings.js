/**
 * commands/settings.js
 *
 * !settings <key> [valor] - consulta ou altera configuracoes persistentes do bot
 */
import { getSetting, setSetting } from "../../lib/storage.js";
import { RUNTIME_SETTING_KEYS, parseSettingValue } from "../../lib/settings.js";
import { ROLE_LEVELS } from "../../lib/permissions.js";

const ALLOWED_KEYS = new Set(RUNTIME_SETTING_KEYS);

export default {
  name: "settings",
  aliases: ["config", "set"],
  descriptionKey: "commands.settings.description",
  usageKey: "commands.settings.usage",
  cooldown: 3000,
  minRole: "bouncer",

  async execute(ctx) {
    const { args, reply, bot, t, senderRoleLevel } = ctx;
    const key = args[0];
    if (!key) {
      await reply(t("commands.settings.usageMessage"));
      return;
    }

    if (key === "list") {
      await reply(
        t("commands.settings.list", {
          keys: RUNTIME_SETTING_KEYS.join(", "),
        }),
      );
      return;
    }

    const isManager = (senderRoleLevel ?? 0) >= ROLE_LEVELS.manager;
    if (!isManager && key !== "duelMuteMin") {
      await reply(t("commands.settings.noPermission", { key }));
      return;
    }

    if (!ALLOWED_KEYS.has(key)) {
      await reply(t("commands.settings.invalidKey"));
      return;
    }
    if (args.length === 1) {
      // Consultar
      const val = await getSetting(key, bot.cfg[key]);
      await reply(
        val !== undefined
          ? t("commands.settings.value", {
              key,
              value: JSON.stringify(val),
            })
          : t("commands.settings.notFound", { key }),
      );
      return;
    }
    // Alterar
    const rawValue = args.slice(1).join(" ");
    const value = parseSettingValue(rawValue);
    await setSetting(key, value);
    bot.updateConfig(key, value);
    await reply(
      t("commands.settings.updated", {
        key,
        value: JSON.stringify(value),
      }),
    );
  },
};
