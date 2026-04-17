import { pickRandom } from "./random.js";
import { getWaitlist } from "./waitlist.js";
import { getRoleLevel } from "../lib/permissions.js";

export const rouletteState = {
  open: false,
  participants: new Map(),
  timeoutId: null,
};

const autoRouletteState = {
  timeoutId: null,
};

const AUTO_ROULETTE_MIN_INTERVAL_MS = 60_000;
const AUTO_ROULETTE_DEFAULT_INTERVAL_MS = 15 * 60_000;

export function resetRouletteState() {
  rouletteState.open = false;
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

const ROULETTE_MOVE_CHANCE = 75;

export async function openRoulette(bot, api, options = {}) {
  const { announce, automatic = false } = options;
  if (rouletteState.open) return false;

  rouletteState.open = true;
  rouletteState.participants.clear();
  const durationMs = bot?.cfg?.rouletteDurationMs ?? 60_000;
  rouletteState.timeoutId = setTimeout(() => {
    closeRoulette(bot, api).catch(() => {});
  }, durationMs);

  const seconds = Math.round(durationMs / 1000);
  const out =
    typeof announce === "function" ? announce : (msg) => bot.sendChat(msg);
  const keyBase = automatic
    ? "commands.fun.roulette.autoOpened"
    : "commands.fun.roulette.opened";
  const lines = bot.tArray(`${keyBase}Lines`) ?? [];
  const msg =
    lines.length > 0
      ? pickRandom(lines).replaceAll("{seconds}", String(seconds))
      : bot.t(keyBase, { seconds });
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
      await openRoulette(bot, api, { automatic: true });
    } catch {
      // best-effort
    } finally {
      scheduleAutoRoulette(bot, api);
    }
  }, intervalMs);
}

export function startAutoRoulette(bot, api) {
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

  const entries = [...rouletteState.participants.entries()];
  rouletteState.participants.clear();

  if (!bot) return;

  const minParticipants = bot.cfg.rouletteMinParticipants ?? 3;
  if (entries.length < minParticipants) {
    const lines =
      bot.tArray("helpers.roulette.closed.fewParticipantsLines") ?? [];
    const msg =
      lines.length > 0
        ? pickRandom(lines).replace("{count}", String(entries.length))
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
      bot.t("helpers.roulette.closed.waitlistError", {
        error: err.message,
      }),
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
      bot.t("helpers.roulette.closed.noPermission", {
        user: loserTag,
      }),
    );
    return;
  }

  const roll = Math.floor(Math.random() * 100);
  const moveInstead = roll < ROULETTE_MOVE_CHANCE;

  if (moveInstead) {
    const pos = Math.floor(Math.random() * waitlist.length) + 1;
    const apiPos = pos - 1;
    const line = pickRandom(bot.tArray("helpers.roulette.moveLines")) ?? "";
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

  const line = pickRandom(bot.tArray("helpers.roulette.shotLines")) ?? "";
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
