import { pickRandom } from "./random.js";
import { getWaitlist } from "./waitlist.js";
import { getRoleLevel } from "../lib/permissions.js";

export const ROULETTE_DURATION_MS = 60_000;
export const rouletteState = {
  open: false,
  participants: new Map(),
  timeoutId: null,
};

export function resetRouletteState() {
  rouletteState.open = false;
  rouletteState.participants.clear();
  if (rouletteState.timeoutId) clearTimeout(rouletteState.timeoutId);
  rouletteState.timeoutId = null;
}

const ROULETTE_MOVE_CHANCE = 75;

export async function closeRoulette(bot, api) {
  if (!rouletteState.open) return;
  rouletteState.open = false;
  if (rouletteState.timeoutId) clearTimeout(rouletteState.timeoutId);
  rouletteState.timeoutId = null;

  const entries = [...rouletteState.participants.entries()];
  rouletteState.participants.clear();

  if (!bot) return;
  if (entries.length === 0) {
    await bot.sendChat(bot.t("helpers.roulette.closed.noParticipants"));
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
    waitlist
      .map((u) => String(u.id ?? u.userId ?? u.user_id ?? ""))
      .filter(Boolean),
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
    if (!api?.room?.moveInWaitlist) {
      await bot.sendChat(bot.t("helpers.roulette.closed.apiUnavailable"));
      return;
    }

    const pos = Math.floor(Math.random() * waitlist.length) + 1;
    const apiPos = pos - 1;
    const line = pickRandom(bot.tArray("helpers.roulette.moveLines")) ?? "";
    const msg = line
      .replaceAll("{name}", loserTag)
      .replaceAll("{pos}", String(pos));
    await bot.sendChat(msg);

    setTimeout(() => {
      void (async () => {
        try {
          await api.room.moveInWaitlist(bot.cfg.room, Number(loserId), apiPos);
        } catch (err) {
          await bot.sendChat(
            bot.t("helpers.roulette.moveError", {
              user: loserTag,
              error: err.message ?? bot.t("common.unknownError"),
            }),
          );
        }
      })();
    }, 1000);
    return;
  }

  if (!api?.room?.removeFromWaitlist) {
    await bot.sendChat(bot.t("helpers.roulette.closed.apiUnavailable"));
    return;
  }

  const line = pickRandom(bot.tArray("helpers.roulette.shotLines")) ?? "";
  const msg = line.replaceAll("{name}", loserTag);
  await bot.sendChat(msg);

  setTimeout(() => {
    void (async () => {
      try {
        await api.room.removeFromWaitlist(bot.cfg.room, Number(loserId));
      } catch (err) {
        await bot.sendChat(
          bot.t("helpers.roulette.removeError", {
            user: loserTag,
            error: err.message ?? bot.t("common.unknownError"),
          }),
        );
      }
    })();
  }, 1000);
}
