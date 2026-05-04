/**
 * commands/index.js — CommandRegistry
 *
 * Loads every .js file from the commands/ directory recursively
 * (excluding itself) and registers them by name + aliases.
 *
 * Each command module must export a default object that satisfies:
 *
 *   {
 *     name:        string          — primary trigger (without prefix)
 *     aliases?:    string[]        — alternative triggers
 *     descriptionKey?: string      — i18n key shown in !help
 *     description?:   string       — fallback if no key is provided
 *     usageKey?:      string       — i18n key shown in !help <command>
 *     usage?:         string       — fallback if no key is provided
 *     cooldown?:   number          — per-user cooldown in ms (default: 3 000)
 *     deleteOn?:   number          — delete the bot reply after N ms (optional)
 *     minRole?:    string          — minimum room role required (e.g. "bouncer", "manager")
 *     execute(ctx): Promise<void>  — command handler
 *   }
 *
 * Context object passed to execute():
 *
 *   {
 *     bot:      WavezBot           — bot instance
 *     api:      ApiClient          — REST client (for advanced commands)
 *     apiCalls: object             — API helper wrappers (lib/api)
 *     args:     string[]           — whitespace-split arguments
 *     rawArgs:  string             — everything after the command name
 *     message:  string             — full original message
 *     messageId: string | null     — chat message id for the command message
 *     sender:   { userId, username, displayName }
 *     senderRole:      string      — sender's room role ("bouncer", "user", etc.)
 *     senderRoleLevel: number      — numeric privilege level of sender
 *     botRole:         string      — bot's own room role
 *     botRoleLevel:    number      — numeric privilege level of bot
 *     room:     string             — room slug
 *     reply(text): Promise<void>   — send a chat message
 *   }
 */

import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import fs from "fs";
import { ROLE_LEVELS } from "../lib/permissions.js";
import { listJsFilesRecursive } from "../helpers/fs.js";
import { t as translate } from "../lib/i18n.js";

export class CommandRegistry {
  constructor() {
    /** @type {Map<string, object>} name → command definition */
    this._commands = new Map();
    /** @type {Map<string, string>} alias → canonical name */
    this._aliases = new Map();
    /** @type {Map<string, boolean>} name → enabled override */
    this._enabled = new Map();
    /** @type {Map<string, number>} "userId:commandName" → lastUsedTs */
    this._cooldowns = new Map();
  }

  reset() {
    this._commands.clear();
    this._aliases.clear();
    this._enabled.clear();
    this._cooldowns.clear();
  }

  // ── Registration ───────────────────────────────────────────────────────────

  /**
   * Register a single command definition.
   * @param {object} cmd
   */
  register(cmd) {
    if (!cmd?.name || typeof cmd.execute !== "function") {
      throw new Error(translate("commands.registry.invalidCommand"));
    }

    const key = cmd.name.toLowerCase();

    if (this._commands.has(key)) {
      console.warn(
        translate("commands.registry.overwrite", {
          command: key,
        }),
      );
    }

    this._commands.set(key, cmd);

    for (const alias of cmd.aliases ?? []) {
      this._aliases.set(alias.toLowerCase(), key);
    }
  }

  /**
   * Dynamically import all .js command files from a directory URL.
   * @param {URL} dirUrl  — e.g. new URL('./commands/', import.meta.url)
   */
  async loadDir(dirUrl) {
    const summary = { loaded: 0, failed: 0, errors: [] };
    const dirPath = fileURLToPath(dirUrl);
    const selfPath = fileURLToPath(import.meta.url);

    let files;
    try {
      files = listJsFilesRecursive(dirPath, new Set([selfPath]));
    } catch (err) {
      summary.failed++;
      summary.errors.push({ file: dirPath, error: err.message });
      return summary;
    }

    files.sort();

    for (const file of files) {
      const rel = path.relative(dirPath, file);
      let exported;
      try {
        const mtimeMs = Number(fs.statSync(file).mtimeMs || Date.now());
        const mod = await import(`${pathToFileURL(file).href}?v=${mtimeMs}`);
        exported = mod.default ?? mod;
      } catch (err) {
        summary.failed++;
        summary.errors.push({ file: rel, error: err.message });
        continue;
      }

      // Support both single-command export and array-of-commands export
      const cmds = Array.isArray(exported) ? exported : [exported];
      const relNormalized = rel.split(path.sep).join("/");
      const category = relNormalized.includes("/")
        ? relNormalized.split("/")[0]
        : "root";
      for (const cmd of cmds) {
        try {
          if (cmd && typeof cmd === "object") {
            cmd.__file = relNormalized;
            cmd.__category = category;
          }
          this.register(cmd);
          summary.loaded++;
        } catch (err) {
          summary.failed++;
          summary.errors.push({ file: rel, error: err.message });
        }
      }
    }

    return summary;
  }

  // ── Lookup ─────────────────────────────────────────────────────────────────

  /** Enable a command by name (overrides definition's `enabled` field). */
  enable(name) {
    this._enabled.set(String(name ?? "").toLowerCase(), true);
  }

  /** Disable a command by name (overrides definition's `enabled` field). */
  disable(name) {
    this._enabled.set(String(name ?? "").toLowerCase(), false);
  }

  /** Returns true if the named command is currently enabled. */
  isEnabled(name) {
    const key = String(name ?? "").toLowerCase();
    if (this._enabled.has(key)) return this._enabled.get(key);
    return this._commands.get(key)?.enabled !== false;
  }

  /**
   * Resolve a command by name or alias. Returns undefined if not found.
   * @param {string} name
   */
  resolve(name) {
    const key = name.toLowerCase();
    if (this._commands.has(key)) return this._commands.get(key);
    const canonical = this._aliases.get(key);
    if (canonical) return this._commands.get(canonical);
    return undefined;
  }

  /**
   * All registered command definitions (unique, no duplicates for aliases).
   * @returns {object[]}
   */
  get all() {
    return [...this._commands.values()].filter((cmd) =>
      this.isEnabled(cmd.name),
    );
  }

  // ── Dispatch ───────────────────────────────────────────────────────────────

  /**
   * Find and execute a command by name. Handles cooldown enforcement.
   * @param {object} ctx  — context built by bot.js
   * @param {string} name — command name (already lowercased, without prefix)
   */
  async dispatch(ctx, name) {
    const cmd = this.resolve(name);
    if (!cmd) return; // silently ignore unknown commands
    if (!this.isEnabled(cmd.name)) return;

    const deleteOnMs = Number(cmd.deleteOn ?? 0);
    if (Number.isFinite(deleteOnMs) && deleteOnMs > 0) {
      const wrapSend = (fn) => async (text) => {
        const res = await fn(text);
        const msg = res?.data?.data?.message ?? res?.data?.message ?? null;
        const id = msg?.id ?? res?.data?.id ?? null;
        if (id && msg?.persisted !== false)
          ctx.bot.scheduleMessageDelete(id, deleteOnMs);
        return res;
      };
      ctx.reply = wrapSend(ctx.reply);
      ctx.send = wrapSend(ctx.send);
    }

    // ── Role check ────────────────────────────────────────────────────────────
    if (cmd.minRole) {
      const required = ROLE_LEVELS[cmd.minRole.toLowerCase()] ?? 0;

      // Check if the bot itself has the required role in the room.
      if ((ctx.botRoleLevel ?? 0) < required) {
        ctx.bot._log(
          "warn",
          ctx.t("commands.registry.botRoleMissingLog", {
            role: cmd.minRole,
            level: ctx.botRoleLevel,
            command: cmd.name,
          }),
        );
        await ctx
          .reply(
            ctx.t("commands.registry.botRoleMissingReply", {
              command: cmd.name,
              role: cmd.minRole,
            }),
          )
          .catch(() => {});
        return;
      }

      // Check if the message sender has the required role.
      if ((ctx.senderRoleLevel ?? 0) < required) {
        await ctx
          .reply(
            ctx.t("commands.registry.userMissingRoleReply", {
              user: ctx.sender.username ?? ctx.sender.userId,
              role: cmd.minRole,
              command: cmd.name,
            }),
          )
          .catch(() => {});
        return;
      }
    }

    // Cooldown check
    const cooldownMs = cmd.cooldown ?? 3_000;
    if (cooldownMs > 0 && ctx.sender?.userId) {
      const ck = `${ctx.sender.userId}:${cmd.name}`;
      const last = this._cooldowns.get(ck) ?? 0;
      const remaining = cooldownMs - (Date.now() - last);
      if (remaining > 0) {
        const secs = Math.ceil(remaining / 1000);
        await ctx
          .reply(
            ctx.t("commands.registry.cooldownReply", {
              user: ctx.sender.username ?? ctx.sender.userId,
              seconds: secs,
              command: cmd.name,
            }),
          )
          .catch(() => {});
        return;
      }
      this._cooldowns.set(ck, Date.now());
      ctx.cancelCooldown = () => this._cooldowns.delete(ck);
    }

    await cmd.execute(ctx);
  }
}
