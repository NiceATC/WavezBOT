/**
 * events/index.js — EventRegistry
 *
 * Auto-loads every .js file from the events/ directory recursively
 * (excluding itself) and runs registered handlers when the matching pipeline event fires.
 *
 * ── Handler definition format ───────────────────────────────────────────────
 *
 *   export default {
 *     name:          string      — identifier (used for enable/disable)
 *     descriptionKey?: string    — i18n key for the description
 *     description?:   string     — fallback if no key is provided
 *     enabled?:      boolean     — default enabled state (default: true)
 *
 *     event?:        number      — single pipeline event code (Events.*)
 *     events?:       number[]    — multiple pipeline event codes
 *
 *     cooldown?:     number | ((ctx, data) => number)
 *                                — 0 or omit to disable registry-managed cooldown.
 *                                  Use a function to read from bot.cfg dynamically.
 *     cooldownScope?: "global" | "user"
 *                                — "user" tracks per-userId; "global" is shared.
 *                                  Default: "global".
 *
 *     handle(ctx, data): Promise<void>
 *   }
 *
 * ── Event context (ctx) passed to handle() ──────────────────────────────────
 *
 *   {
 *     bot:      WavezBot       — bot instance (access cfg, sendChat, etc.)
 *     api:      ApiClient      — @wavezfm/api REST client
 *     room:     string         — room slug
 *     reply(text): Promise<void>  — send a chat message in the room
 *   }
 *
 * ── Example handler ─────────────────────────────────────────────────────────
 *
 *   import { Events } from "../../lib/wavez-events.js";
 *
 *   export default {
 *     name: "myHandler",
 *     descriptionKey: "events.myHandler.description",
 *     event: Events.ROOM_DJ_ADVANCE,
 *     async handle(ctx, data) {
 *       await ctx.reply(`Now playing: ${data?.media?.title}`);
 *     },
 *   };
 */

import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import { listJsFilesRecursive } from "../helpers/fs.js";
import { t as translate } from "../lib/i18n.js";

export class EventRegistry {
  constructor() {
    /** @type {Map<string, object>} name → normalised handler definition */
    this._handlers = new Map();
    /** @type {Map<string, boolean>} name → enabled override */
    this._enabled = new Map();
    /** @type {Map<string, number>} cooldown key → last-fired timestamp */
    this._cooldowns = new Map();
  }

  reset() {
    this._handlers.clear();
    this._enabled.clear();
    this._cooldowns.clear();
  }

  // ── Registration ───────────────────────────────────────────────────────────

  /**
   * Register a single event handler definition.
   * @param {object} def
   */
  register(def) {
    if (!def?.name || typeof def.handle !== "function") {
      throw new Error(translate("events.registry.invalidHandler"));
    }

    const events = Array.isArray(def.events)
      ? def.events
      : def.event != null
        ? [def.event]
        : [];

    if (events.length === 0) {
      throw new Error(
        translate("events.registry.missingEvent", {
          name: def.name,
        }),
      );
    }

    const key = def.name.toLowerCase();
    if (this._handlers.has(key)) {
      console.warn(
        translate("events.registry.overwrite", {
          name: key,
        }),
      );
    }

    // Store a normalised copy with pre-computed _events array
    this._handlers.set(key, { ...def, _events: events });
  }

  /**
   * Dynamically import all .js files from a directory URL.
   * Supports both single-handler exports and array-of-handlers exports.
   * @param {URL} dirUrl  — e.g. new URL("../events/", import.meta.url)
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
        const mod = await import(pathToFileURL(file).href);
        exported = mod.default ?? mod;
      } catch (err) {
        summary.failed++;
        summary.errors.push({ file: rel, error: err.message });
        continue;
      }

      const defs = Array.isArray(exported) ? exported : [exported];
      const relNormalized = rel.split(path.sep).join("/");
      const category = relNormalized.includes("/")
        ? relNormalized.split("/")[0]
        : "root";
      for (const def of defs) {
        try {
          if (def && typeof def === "object") {
            def.__file = relNormalized;
            def.__category = category;
          }
          this.register(def);
          summary.loaded++;
        } catch (err) {
          summary.failed++;
          summary.errors.push({ file: rel, error: err.message });
        }
      }
    }

    return summary;
  }

  // ── Enable / disable ───────────────────────────────────────────────────────

  /** Enable a handler by name (overrides definition's `enabled` field). */
  enable(name) {
    this._enabled.set(name.toLowerCase(), true);
  }

  /** Disable a handler by name (overrides definition's `enabled` field). */
  disable(name) {
    this._enabled.set(name.toLowerCase(), false);
  }

  /** Returns true if the named handler is currently enabled. */
  isEnabled(name) {
    const key = name.toLowerCase();
    if (this._enabled.has(key)) return this._enabled.get(key);
    return this._handlers.get(key)?.enabled !== false;
  }

  // ── Introspection ──────────────────────────────────────────────────────────

  /**
   * Returns the handler definition for a given name, or null if not found.
   * Useful for modifying a handler's `cooldown` value at startup.
   * @param {string} name
   */
  getHandler(name) {
    return this._handlers.get(name.toLowerCase()) ?? null;
  }

  /** Returns all registered handlers (no enable filter). */
  get all() {
    return [...this._handlers.values()];
  }

  /** Number of registered handlers. */
  get count() {
    return this._handlers.size;
  }

  /**
   * Returns the union of pipeline event codes required by all currently
   * enabled handlers. Used by bot.js to build the SUBSCRIBE list.
   * @returns {number[]}
   */
  getRequiredEvents() {
    const events = new Set();
    for (const def of this._handlers.values()) {
      if (this.isEnabled(def.name)) {
        def._events.forEach((e) => events.add(e));
      }
    }
    return [...events];
  }

  /** All registered handler definitions (unique). */
  get all() {
    return [...this._handlers.values()];
  }

  // ── Dispatch ───────────────────────────────────────────────────────────────

  /**
   * Evaluate all handlers subscribed to `pipelineEvent`.
   * Handles enable/disable and cooldown logic before calling handle().
   *
   * @param {string}  pipelineEvent — Events.* name from lib/wavez-events.js
   * @param {object}  ctx           — event context from bot._buildEventCtx()
   * @param {object}  data          — raw pipeline event payload
   */
  async dispatch(pipelineEvent, ctx, data) {
    for (const def of this._handlers.values()) {
      if (!def._events.includes(pipelineEvent)) continue;
      if (!this.isEnabled(def.name)) continue;

      // ── Cooldown ──────────────────────────────────────────────────────────
      const cooldownMs =
        typeof def.cooldown === "function"
          ? def.cooldown(ctx, data)
          : (def.cooldown ?? 0);

      if (cooldownMs > 0) {
        const scope = def.cooldownScope ?? "global";
        const subject =
          scope === "user"
            ? String(data?.userId ?? data?.user_id ?? data?.id ?? "global")
            : "global";
        const ck = `${subject}:${def.name}`;
        const last = this._cooldowns.get(ck) ?? 0;
        if (Date.now() - last < cooldownMs) continue;
        this._cooldowns.set(ck, Date.now());
      }

      // ── Execute ───────────────────────────────────────────────────────────
      try {
        await def.handle(ctx, data);
      } catch (err) {
        ctx.bot._log(
          "warn",
          ctx.t("events.registry.handlerError", {
            name: def.name,
            error: err.message,
          }),
        );
      }
    }
  }
}
