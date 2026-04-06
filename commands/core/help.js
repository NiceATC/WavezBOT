/**
 * commands/help.js
 *
 * !help          — list all available commands
 * !help <name>   — show detailed usage for a specific command
 */

import { ROLE_LEVELS } from "../../lib/permissions.js";
import { sendChatChunks } from "../../helpers/chat.js";

const dashboardEnabled = ["true", "1", "yes"].includes(
  String(process.env.DASHBOARD_ENABLED ?? "")
    .trim()
    .toLowerCase(),
);
const dashboardUrl = String(process.env.DASHBOARD_PUBLIC_URL ?? "").trim();
const dashboardPort = Number(process.env.DASHBOARD_PORT) || 3000;

export default {
  name: "help",
  aliases: ["comandos", "commands", "ajuda"],
  descriptionKey: "commands.help.description",
  usageKey: "commands.help.usage",
  cooldown: 5_000,

  async execute(ctx) {
    const { args, bot, reply, t, senderRoleLevel } = ctx;

    const getDesc = (cmd) =>
      cmd.descriptionKey ? t(cmd.descriptionKey) : (cmd.description ?? "");
    const getUsage = (cmd) =>
      cmd.usageKey ? t(cmd.usageKey) : (cmd.usage ?? "");

    if (dashboardEnabled) {
      const url = dashboardUrl || `http://localhost:${dashboardPort}`;
      await reply(t("commands.help.dashboard", { url }));
      return;
    }

    if (args.length > 0) {
      // Detailed help for one command
      const cmd = bot.commands.resolve(args[0].toLowerCase());
      if (!cmd) {
        await reply(t("commands.help.notFound", { name: args[0] }));
        return;
      }
      const lines = [`!${cmd.name} — ${getDesc(cmd)}`];
      const usage = getUsage(cmd);
      if (usage) lines.push(t("commands.help.usageLine", { usage }));
      if (cmd.aliases?.length) {
        lines.push(
          t("commands.help.aliasesLine", {
            aliases: cmd.aliases.map((a) => `!${a}`).join(", "),
          }),
        );
      }
      if (cmd.minRole) {
        lines.push(
          t("commands.help.requirementLine", {
            role: cmd.minRole,
          }),
        );
      }
      await reply(lines.join(" | "));
      return;
    }

    // List all commands
    const userLevel = senderRoleLevel ?? 0;
    const list = bot.commands.all
      .filter((c) => {
        if (!c.minRole) return true;
        const required = ROLE_LEVELS[c.minRole.toLowerCase()] ?? 0;
        return userLevel >= required;
      })
      .map((c) => `!${c.name}`)
      .sort()
      .join("  ");
    const message = t("commands.help.list", {
      list,
    });
    await sendChatChunks(reply, message);
  },
};
