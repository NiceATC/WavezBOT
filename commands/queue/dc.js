/**
 * commands/dc.js
 *
 * !dc [usuario] - restaura a posicao do usuario na fila se o DC foi recente
 */

import { findWaitlistSnapshotByIdentity } from "../../lib/storage.js";
import { ROLE_LEVELS } from "../../lib/permissions.js";
import { pickRandom } from "../../helpers/random.js";
import { formatDuration } from "../../helpers/time.js";
import {
  getWaitlistPositionForIndex,
  getWaitlistTotal,
} from "../../lib/waitlist.js";

const DC_MIN_FALLBACK = 10;
const NEAR_EXPIRY_MAX_MS = 60_000;
const NEAR_EXPIRY_MIN_MS = 15_000;
const recentRestores = new Map();

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function resolveQueueEntryByInput(entries, input) {
  const wanted = normalizeText(input);
  if (!wanted) return null;

  for (const entry of entries) {
    const candidates = [
      entry?.internalId,
      entry?.userId,
      entry?.user_id,
      entry?.publicId,
      entry?.id,
      entry?.username,
      entry?.displayName,
      entry?.display_name,
    ];
    if (candidates.some((candidate) => normalizeText(candidate) === wanted)) {
      return entry;
    }
  }

  return null;
}

function getDcReferenceTs(snapshot) {
  const leftAt = Number(snapshot?.last_left_at ?? snapshot?.lastLeftAt ?? 0);
  const seenAt = Number(snapshot?.last_seen_at ?? snapshot?.lastSeenAt ?? 0);
  return leftAt || seenAt || 0;
}

function getSnapshotDcMeta(snapshot) {
  return {
    leftAt: Number(snapshot?.last_left_at ?? snapshot?.lastLeftAt ?? 0) || 0,
    seenAt: Number(snapshot?.last_seen_at ?? snapshot?.lastSeenAt ?? 0) || 0,
  };
}

function formatTemplate(template, vars = {}) {
  return String(template ?? "").replace(/\{(\w+)\}/g, (match, key) => {
    const value = vars[key];
    return value == null ? match : String(value);
  });
}

function pickReply(tArray, t, linesKey, fallbackKey, vars = {}) {
  const template = pickRandom(tArray(linesKey)) ?? t(fallbackKey, vars);
  return formatTemplate(template, vars);
}

function isNearExpiry(elapsedMs, dcWindowMs) {
  const remainingMs = dcWindowMs - elapsedMs;
  const dynamicThreshold = Math.floor(dcWindowMs * 0.2);
  const threshold = Math.min(
    NEAR_EXPIRY_MAX_MS,
    Math.max(NEAR_EXPIRY_MIN_MS, dynamicThreshold),
  );
  return remainingMs > 0 && remainingMs <= threshold;
}

function toEventList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.events)) return payload.events;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function eventTsMs(event) {
  const raw =
    event?.createdAt ??
    event?.created_at ??
    event?.timestamp ??
    event?.time ??
    null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw > 1e12 ? raw : raw * 1000;
  }
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function eventType(event) {
  return String(event?.type ?? event?.event ?? "")
    .trim()
    .toLowerCase();
}

function eventUserId(event) {
  const user = event?.user ?? event?.actor ?? event?.target ?? null;
  return String(
    event?.userId ??
      event?.user_id ??
      user?.userId ??
      user?.user_id ??
      user?.id ??
      "",
  );
}

async function getRecentPresenceMeta(api, roomId, targetUserId, sinceIso) {
  if (!roomId || !targetUserId || !api?.room?.getEvents) {
    return { lastJoinAt: 0, lastLeftAt: 0 };
  }

  try {
    const res = await api.room.getEvents(roomId, {
      limit: 50,
      since: sinceIso,
      types: ["user_joined", "user_left"],
    });
    const events = toEventList(res?.data);

    let lastJoinAt = 0;
    let lastLeftAt = 0;

    for (const evt of events) {
      if (eventUserId(evt) !== String(targetUserId)) continue;
      const ts = eventTsMs(evt);
      const type = eventType(evt);
      if (type === "user_joined" && ts > lastJoinAt) lastJoinAt = ts;
      if ((type === "user_left" || type === "user_leave") && ts > lastLeftAt) {
        lastLeftAt = ts;
      }
    }

    return { lastJoinAt, lastLeftAt };
  } catch {
    return { lastJoinAt: 0, lastLeftAt: 0 };
  }
}

export default {
  name: "dc",
  aliases: ["dclookup"],
  descriptionKey: "commands.queue.dc.description",
  usageKey: "commands.queue.dc.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { api, bot, args, sender, senderRoleLevel, reply, t, tArray } = ctx;
    const targetInput = (
      args[0] ??
      sender.username ??
      sender.displayName ??
      ""
    ).trim();

    if (!targetInput) {
      await reply(
        pickReply(
          tArray,
          t,
          "commands.queue.dc.usageLines",
          "commands.queue.dc.usageMessage",
        ),
      );
      return;
    }

    const roomUser = bot.findRoomUser(targetInput);
    const isSelf =
      roomUser && String(roomUser.userId) === String(sender.userId ?? "");

    if (!isSelf && senderRoleLevel < ROLE_LEVELS.bouncer) {
      await reply(
        pickReply(
          tArray,
          t,
          "commands.queue.dc.noPermissionLines",
          "commands.queue.dc.noPermission",
          { user: sender.displayName ?? sender.username ?? "você" },
        ),
      );
      return;
    }

    try {
      const qRes = await api.room.getQueueStatus(bot.cfg.room);
      const queue = qRes?.data ?? {};
      const entries = Array.isArray(queue.entries) ? queue.entries : [];
      const entry =
        (roomUser
          ? resolveQueueEntryByInput(entries, roomUser.userId)
          : null) ?? resolveQueueEntryByInput(entries, targetInput);

      const queuedTargetUserId = entry
        ? String(entry.internalId ?? entry.userId ?? entry.user_id ?? entry.id)
        : null;

      const hintedTargetUserId =
        queuedTargetUserId ??
        (String(roomUser?.userId ?? roomUser?.id ?? "") || null);

      let snap = hintedTargetUserId
        ? await findWaitlistSnapshotByIdentity(hintedTargetUserId, {
            roomSlug: bot.cfg.room,
          })
        : null;

      if (!snap) {
        snap = await findWaitlistSnapshotByIdentity(targetInput, {
          roomSlug: bot.cfg.room,
        });
      }

      if (!snap) {
        await reply(
          pickReply(
            tArray,
            t,
            "commands.queue.dc.noSnapshotLines",
            "commands.queue.dc.noSnapshot",
            { user: targetInput },
          ),
        );
        return;
      }

      let targetUserId = String(
        queuedTargetUserId ??
          snap?.user_id ??
          snap?.userId ??
          roomUser?.userId ??
          roomUser?.id ??
          "",
      );

      if (!targetUserId) {
        await reply(
          pickReply(
            tArray,
            t,
            "commands.queue.dc.mustJoinLines",
            "commands.queue.dc.mustJoin",
            { user: targetInput },
          ),
        );
        return;
      }

      if (!entry) {
        try {
          await api.room.addToWaitlist(
            bot.roomId ?? bot.cfg.room,
            targetUserId,
          );
          const refreshed = await api.room.getQueueStatus(bot.cfg.room);
          const refreshedQueue = refreshed?.data ?? {};
          queue.entries = Array.isArray(refreshedQueue?.entries)
            ? refreshedQueue.entries
            : [];
          queue.playback = refreshedQueue?.playback ?? queue.playback;
        } catch {
          await reply(
            pickReply(
              tArray,
              t,
              "commands.queue.dc.mustJoinLines",
              "commands.queue.dc.mustJoin",
              { user: targetInput },
            ),
          );
          return;
        }
      }

      const activeEntries = Array.isArray(queue.entries) ? queue.entries : [];
      const activeEntry = resolveQueueEntryByInput(activeEntries, targetUserId);
      if (!activeEntry) {
        await reply(
          pickReply(
            tArray,
            t,
            "commands.queue.dc.mustJoinLines",
            "commands.queue.dc.mustJoin",
            { user: targetInput },
          ),
        );
        return;
      }

      targetUserId = String(
        activeEntry.internalId ??
          activeEntry.userId ??
          activeEntry.user_id ??
          activeEntry.id,
      );

      const baseWindowMin = Number(bot.cfg.dcWindowMin ?? DC_MIN_FALLBACK);
      const windowMin = await bot.getDcWindowMinutes(
        targetUserId,
        baseWindowMin,
      );
      const dcWindowMs = Math.max(1, windowMin) * 60 * 1000;
      const { leftAt, seenAt } = getSnapshotDcMeta(snap);

      const sinceIso = new Date(Date.now() - dcWindowMs * 2).toISOString();
      // getRecentPresenceMeta filters events by userId; the platform presence
      // API uses the stable platform UUID (same as WS user_joined/user_left),
      // NOT the session-scoped internalId stored in waitlist_state.  Prefer
      // roomUser.userId (UUID) so the lookup actually finds events.
      const presenceTargetId = roomUser?.userId ?? roomUser?.id ?? targetUserId;
      const presence = await getRecentPresenceMeta(
        api,
        bot.roomId ?? bot.cfg.room,
        presenceTargetId,
        sinceIso,
      );
      const presenceLeftAt = Number(presence?.lastLeftAt ?? 0) || 0;

      // Se não há qualquer timestamp de fila, não há evidência para DC restore.
      if (!leftAt && !seenAt && !presenceLeftAt) {
        await reply(
          pickReply(
            tArray,
            t,
            "commands.queue.dc.noDcDetectedLines",
            "commands.queue.dc.noDcDetected",
            { user: targetInput },
          ),
        );
        return;
      }

      const refAt = Math.max(getDcReferenceTs(snap), presenceLeftAt);
      const elapsedMs = Date.now() - refAt;
      if (!refAt || elapsedMs > dcWindowMs) {
        const justMissed = elapsedMs - dcWindowMs <= NEAR_EXPIRY_MAX_MS;
        const expiredKey = justMissed
          ? "commands.queue.dc.expiredNearLines"
          : "commands.queue.dc.expiredLines";
        await reply(
          pickReply(tArray, t, expiredKey, "commands.queue.dc.expired", {
            user: targetInput,
          }),
        );
        return;
      }

      let position = Number(snap.position ?? 0);
      if (!Number.isFinite(position) || position < 1) {
        await reply(
          pickReply(
            tArray,
            t,
            "commands.queue.dc.invalidPositionLines",
            "commands.queue.dc.invalidPosition",
            { user: targetInput },
          ),
        );
        return;
      }

      const currentDjId = queue?.playback?.djId ?? null;
      const currentIndex = activeEntries.findIndex((candidate) => {
        const candidateId = String(
          candidate?.internalId ??
            candidate?.userId ??
            candidate?.user_id ??
            candidate?.id ??
            "",
        );
        return candidateId === targetUserId;
      });
      const currentPosition = getWaitlistPositionForIndex(
        currentIndex,
        activeEntries,
        {
          currentDjId,
        },
      );

      // Não faz sentido fazer restore se o usuário já está melhor/igual.
      if (Number.isFinite(currentPosition) && currentPosition <= position) {
        await reply(
          pickReply(
            tArray,
            t,
            "commands.queue.dc.alreadyBetterPositionLines",
            "commands.queue.dc.alreadyBetterPosition",
            {
              user: targetInput,
              current: currentPosition,
              target: position,
            },
          ),
        );
        return;
      }

      // Sem last_left_at explícito, só prossegue se houver sinal claro de queda de posição.
      const hasDcSignal =
        leftAt > 0 ||
        presenceLeftAt > 0 ||
        (Number.isFinite(currentPosition) && currentPosition > position);
      if (!hasDcSignal) {
        await reply(
          pickReply(
            tArray,
            t,
            "commands.queue.dc.noDcDetectedLines",
            "commands.queue.dc.noDcDetected",
            { user: targetInput },
          ),
        );
        return;
      }

      const maxPos = Math.max(
        1,
        getWaitlistTotal(activeEntries, { currentDjId }),
      );
      if (position > maxPos) position = maxPos;
      if (position < 1) position = 1;

      const restoreKey = `${bot.cfg.room}:${targetUserId}`;
      const previousRestore = recentRestores.get(restoreKey);
      if (
        previousRestore &&
        previousRestore.refAt === refAt &&
        previousRestore.position === position &&
        Date.now() - previousRestore.at < dcWindowMs
      ) {
        await reply(
          pickReply(
            tArray,
            t,
            "commands.queue.dc.alreadyRestoredLines",
            "commands.queue.dc.alreadyRestored",
            { user: targetInput, position },
          ),
        );
        return;
      }

      // reorder_queue expects a 0-based index
      const apiPos = position - 1;

      if (!bot.wsReorderQueue(targetUserId, apiPos)) {
        throw new Error("WebSocket indisponível para reorder_queue");
      }

      recentRestores.set(restoreKey, {
        refAt,
        position,
        at: Date.now(),
      });

      const displayName =
        activeEntry.displayName ??
        activeEntry.display_name ??
        activeEntry.username ??
        roomUser?.displayName ??
        roomUser?.username ??
        targetInput;

      const nearExpiry = isNearExpiry(elapsedMs, dcWindowMs);
      const remaining = formatDuration(Math.max(0, dcWindowMs - elapsedMs));
      const movedKey = nearExpiry
        ? "commands.queue.dc.movedNearLines"
        : "commands.queue.dc.movedLines";

      await reply(
        pickReply(tArray, t, movedKey, "commands.queue.dc.moved", {
          user: displayName,
          position,
          remaining,
        }),
      );
    } catch (err) {
      await reply(
        pickReply(
          tArray,
          t,
          "commands.queue.dc.errorLines",
          "commands.queue.dc.error",
          {
            error: err.message,
          },
        ),
      );
    }

    // TODO(dev): Add dedicated WS room-enter/room-leave playful notifications
    // (ROOM_USER_JOIN / ROOM_USER_LEAVE) once product copy is approved.
  },
};
