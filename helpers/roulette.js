import { pickRandom } from "./random.js";
import { getWaitlist } from "./waitlist.js";
import { getRoleLevel } from "../lib/permissions.js";

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
