import { pickRandom } from "./random.js";
import { getWaitlist } from "./waitlist.js";
import { getRoleLevel } from "../lib/permissions.js";

// ── Roulette types ─────────────────────────────────────────────────────────
// "russian"  — 75% move to random pos, 25% remove (classic)
// "troll"    — same mechanics, different messages
// "destiny"  — winner always moved to position 2

export const ROULETTE_TYPES = ["russian", "troll", "destiny"];

export const rouletteState = {
  open: false,
  type: "russian",
  participants: new Map(),
  timeoutId: null,
};

const autoRouletteState = {
  timeoutId: null,
  typeIndex: 0, // cycles through ROULETTE_TYPES in order
};

const AUTO_ROULETTE_MIN_INTERVAL_MS = 60_000;
const AUTO_ROULETTE_DEFAULT_INTERVAL_MS = 20 * 60_000;

export function resetRouletteState() {
  rouletteState.open = false;
  rouletteState.type = "russian";
  rouletteState.participants.clear();
  if (rouletteState.timeoutId) clearTimeout(rouletteState.timeoutId);
  rouletteState.timeoutId = null;
}

function getAutoRouletteIntervalMs(bot) {
  const raw = Number(bot?.cfg?.autoRouletteIntervalMs);
  if (!Number.isFinite(raw) || raw <= 0) {
    return AUTO_ROULETTE_DEFAULT_INTERVAL_MS;
  }
  return Math.max(AUTO_ROULETTE_MIN_INTERVAL_MS, Math.floor(raw));
}

// Returns the i18n prefix for command-level messages (opened, alreadyOpen…)
function cmdKeyPrefix(type) {
  if (type === "troll") return "commands.fun.roulette.troll";
  if (type === "destiny") return "commands.fun.roulette.destiny";
  return "commands.fun.roulette";
}

// Returns the i18n prefix for helper-level messages (moveLines, shotLines…)
function helperKeyPrefix(type) {
  if (type === "troll") return "helpers.roulette.troll";
  if (type === "destiny") return "helpers.roulette.destiny";
  return "helpers.roulette";
}

// Resolve an array key with fallback to the base russian key
function tArrayWithFallback(bot, key, fallbackKey) {
  const lines = bot.tArray(key) ?? [];
  if (lines.length > 0) return lines;
  if (fallbackKey && fallbackKey !== key) return bot.tArray(fallbackKey) ?? [];
  return [];
}

const ROULETTE_MOVE_CHANCE = 75;

export async function openRoulette(bot, api, options = {}) {
  const { announce, automatic = false, type = "russian" } = options;
  if (rouletteState.open) return false;

  rouletteState.open = true;
  rouletteState.type = type;
  rouletteState.participants.clear();
  const durationMs = bot?.cfg?.rouletteDurationMs ?? 60_000;
  rouletteState.timeoutId = setTimeout(() => {
    closeRoulette(bot, api).catch(() => {});
  }, durationMs);

  const seconds = Math.round(durationMs / 1000);
  const out =
    typeof announce === "function" ? announce : (msg) => bot.sendChat(msg);
  const prefix = cmdKeyPrefix(type);
  const keyBase = automatic ? `${prefix}.autoOpened` : `${prefix}.opened`;
  const lines = tArrayWithFallback(
    bot,
    `${keyBase}Lines`,
    automatic
      ? "commands.fun.roulette.autoOpenedLines"
      : "commands.fun.roulette.openedLines",
  );
  const msg =
    lines.length > 0
      ? pickRandom(lines).replaceAll("{seconds}", String(seconds))
      : bot.t(keyBase, { seconds }) ||
        bot.t(
          automatic
            ? "commands.fun.roulette.autoOpened"
            : "commands.fun.roulette.opened",
          { seconds },
        );
  await out(msg);
  return true;
}

function scheduleAutoRoulette(bot, api) {
  stopAutoRoulette();
  if (!bot?.cfg?.autoRouletteEnabled) return;

  const intervalMs = getAutoRouletteIntervalMs(bot);
  autoRouletteState.timeoutId = setTimeout(async () => {
    autoRouletteState.timeoutId = null;
    try {
      if (!bot || !api || !bot.cfg?.autoRouletteEnabled) return;
      if (typeof bot.isPaused === "function" && bot.isPaused()) return;
      if (rouletteState.open) return;
      // Rotate: russian → troll → destiny → russian → …
      const type =
        ROULETTE_TYPES[autoRouletteState.typeIndex % ROULETTE_TYPES.length];
      autoRouletteState.typeIndex =
        (autoRouletteState.typeIndex + 1) % ROULETTE_TYPES.length;
      await openRoulette(bot, api, { automatic: true, type });
    } catch {
      // best-effort
    } finally {
      scheduleAutoRoulette(bot, api);
    }
  }, intervalMs);
}

export function startAutoRoulette(bot, api) {
  autoRouletteState.typeIndex = 0;
  scheduleAutoRoulette(bot, api);
}

export function stopAutoRoulette() {
  if (autoRouletteState.timeoutId) {
    clearTimeout(autoRouletteState.timeoutId);
  }
  autoRouletteState.timeoutId = null;
}

export async function closeRoulette(bot, api) {
  if (!rouletteState.open) return;
  rouletteState.open = false;
  if (rouletteState.timeoutId) clearTimeout(rouletteState.timeoutId);
  rouletteState.timeoutId = null;

  const type = rouletteState.type ?? "russian";
  const hPrefix = helperKeyPrefix(type);
  const hBase = "helpers.roulette";

  const entries = [...rouletteState.participants.entries()];
  rouletteState.participants.clear();

  if (!bot) return;

  const minParticipants = bot.cfg.rouletteMinParticipants ?? 3;
  if (entries.length < minParticipants) {
    const lines = tArrayWithFallback(
      bot,
      `${hPrefix}.closed.fewParticipantsLines`,
      `${hBase}.closed.fewParticipantsLines`,
    );
    const msg =
      lines.length > 0
        ? pickRandom(lines)
            .replace("{count}", String(entries.length))
            .replace("{min}", String(minParticipants))
        : bot.t("helpers.roulette.closed.fewParticipants", {
            count: entries.length,
            min: minParticipants,
          });
    await bot.sendChat(msg);
    return;
  }

  if (!api) {
    await bot.sendChat(bot.t("helpers.roulette.closed.apiUnavailable"));
    return;
  }

  let waitlist = [];
  try {
    waitlist = await getWaitlist(api, bot.cfg.room);
  } catch (err) {
    await bot.sendChat(
      bot.t("helpers.roulette.closed.waitlistError", { error: err.message }),
    );
    return;
  }

  if (!waitlist.length) {
    await bot.sendChat(bot.t("helpers.roulette.closed.emptyQueue"));
    return;
  }

  const waitlistIds = new Set(
    waitlist.map((u) => u?.internalId ?? u?.id ?? "").filter(Boolean),
  );
  const eligible = entries.filter(([id]) => waitlistIds.has(String(id)));

  if (!eligible.length) {
    await bot.sendChat(bot.t("helpers.roulette.closed.noEligible"));
    return;
  }

  const [loserId, loserNameRaw] = pickRandom(eligible) ?? [];
  if (!loserId) {
    await bot.sendChat(bot.t("helpers.roulette.closed.noTarget"));
    return;
  }

  const loserName = loserNameRaw ?? bot.t("common.someone");
  const loserTag = loserName.startsWith("@") ? loserName : `@${loserName}`;

  if (bot.getBotRoleLevel() < getRoleLevel("bouncer")) {
    await bot.sendChat(
      bot.t("helpers.roulette.closed.noPermission", { user: loserTag }),
    );
    return;
  }

  // ── Roleta Destino: sempre move para posição 2 ──────────────────────────
  if (type === "destiny") {
    const apiPos = 1; // índice 0-based → posição 2
    const dispPos = 2;
    const moveLines = tArrayWithFallback(
      bot,
      `${hPrefix}.moveLines`,
      `${hBase}.moveLines`,
    );
    const line = moveLines.length > 0 ? pickRandom(moveLines) : "";
    const msg = line
      .replaceAll("{name}", loserTag)
      .replaceAll("{pos}", String(dispPos));
    await bot.sendChat(msg);
    setTimeout(() => {
      try {
        bot.wsReorderQueue(loserId, apiPos);
      } catch (err) {
        void bot.sendChat(
          bot.t("helpers.roulette.moveError", {
            user: loserTag,
            error: err.message ?? bot.t("common.unknownError"),
          }),
        );
      }
    }, 1000);
    return;
  }

  // ── Roleta Russa / Troll: 75% move aleatório, 25% remove ───────────────
  const roll = Math.floor(Math.random() * 100);
  const moveInstead = roll < ROULETTE_MOVE_CHANCE;

  if (moveInstead) {
    const pos = Math.floor(Math.random() * waitlist.length) + 1;
    const apiPos = pos - 1;
    const moveLines = tArrayWithFallback(
      bot,
      `${hPrefix}.moveLines`,
      `${hBase}.moveLines`,
    );
    const line = moveLines.length > 0 ? pickRandom(moveLines) : "";
    const msg = line
      .replaceAll("{name}", loserTag)
      .replaceAll("{pos}", String(pos));
    await bot.sendChat(msg);
    setTimeout(() => {
      try {
        bot.wsReorderQueue(loserId, apiPos);
      } catch (err) {
        void bot.sendChat(
          bot.t("helpers.roulette.moveError", {
            user: loserTag,
            error: err.message ?? bot.t("common.unknownError"),
          }),
        );
      }
    }, 1000);
    return;
  }

  const shotLines = tArrayWithFallback(
    bot,
    `${hPrefix}.shotLines`,
    `${hBase}.shotLines`,
  );
  const line = shotLines.length > 0 ? pickRandom(shotLines) : "";
  const msg = line.replaceAll("{name}", loserTag);
  await bot.sendChat(msg);

  setTimeout(() => {
    try {
      bot.wsRemoveFromQueue(loserId);
    } catch (err) {
      void bot.sendChat(
        bot.t("helpers.roulette.removeError", {
          user: loserTag,
          error: err.message ?? bot.t("common.unknownError"),
        }),
      );
    }
  }, 1000);
}
