import { formatPoints } from "../../helpers/points.js";
import { formatDuration } from "../../helpers/time.js";
import {
  renderMarriageCertificate,
  renderMarriageStatusCard,
  renderDivorceCertificate,
} from "../../helpers/marriage-card.js";
import { uploadToImgbb } from "../../helpers/imgbb.js";
import { divorceMarriage, setMarriagePair } from "../../lib/storage.js";
import { getRoleLevel } from "../../lib/permissions.js";

const PENDING_PROPOSALS = new Map();
const PENDING_OBJECTIONS = new Map();
const JUDGE_MIN_LEVEL = getRoleLevel("cohost");

async function safeReply(reply, send, text) {
  try {
    await reply(text);
  } catch {
    await send(text);
  }
}

function pruneExpiredProposals() {
  const now = Date.now();
  for (const [targetId, proposal] of PENDING_PROPOSALS.entries()) {
    if ((Number(proposal?.expiresAt) || 0) <= now) {
      PENDING_PROPOSALS.delete(targetId);
    }
  }
}

function findOutgoingProposal(fromId) {
  for (const proposal of PENDING_PROPOSALS.values()) {
    if (String(proposal?.fromId) === String(fromId)) return proposal;
  }
  return null;
}

function buildCoupleKey(aId, bId) {
  return [String(aId), String(bId)].sort().join(":");
}

function findObjectionByUserId(userId) {
  const uid = String(userId ?? "");
  for (const [key, entry] of PENDING_OBJECTIONS.entries()) {
    if (entry?.closed) continue;
    if (String(entry?.userAId) === uid || String(entry?.userBId) === uid) {
      return { key, entry };
    }
  }
  return null;
}

function getActiveObjection() {
  for (const [key, entry] of PENDING_OBJECTIONS.entries()) {
    if (!entry?.closed) return { key, entry };
  }
  return null;
}

async function finalizeObjection(bot, key) {
  const entry = PENDING_OBJECTIONS.get(key);
  if (!entry || entry.closed) return;
  entry.closed = true;
  if (entry.timeoutId) clearTimeout(entry.timeoutId);
  PENDING_OBJECTIONS.delete(key);

  const objectionVotes = entry.votes.size;
  if (objectionVotes >= entry.requiredVotes) {
    await bot.sendChat(
      bot.t("commands.economy.marriage.objectionCancelled", {
        left: `@${entry.userAName}`,
        right: `@${entry.userBName}`,
        votes: objectionVotes,
        required: entry.requiredVotes,
      }),
    );
    return;
  }

  const marriedAt = Date.now();
  await setMarriagePair(entry.userAId, entry.userBId, marriedAt);

  await bot.sendChat(
    bot.t("commands.economy.marriage.objectionApproved", {
      left: `@${entry.userAName}`,
      right: `@${entry.userBName}`,
      votes: objectionVotes,
      required: entry.requiredVotes,
    }),
  );

  if (bot.cfg.imageRenderingEnabled && process.env.IMGBB_API_KEY) {
    try {
      const card = await renderMarriageCertificate({
        partnerA: entry.userAName,
        partnerB: entry.userBName,
        marriedAt,
        labels: {
          title: bot.t("commands.economy.marriage.certificate.title"),
          subtitle: bot.t("commands.economy.marriage.certificate.subtitle"),
          between: bot.t("commands.economy.marriage.certificate.between"),
          date: bot.t("commands.economy.marriage.certificate.date"),
        },
      });
      const url = await uploadToImgbb(
        card,
        `marriage-${entry.userAId}-${entry.userBId}`,
      );
      await bot.sendChat(url);
    } catch {
      // noop
    }
  }
}

function normalizeAction(input) {
  const raw = String(input ?? "")
    .trim()
    .toLowerCase();
  if (["accept", "aceitar"].includes(raw)) return "accept";
  if (["reject", "recusar"].includes(raw)) return "reject";
  if (["contra", "object", "objection"].includes(raw)) return "object";
  if (["annul", "anular", "juiz"].includes(raw)) return "annul";
  if (["status", "info", "estado"].includes(raw)) return "status";
  if (["divorce", "divorcio", "divórcio"].includes(raw)) return "divorce";
  return "propose";
}

function resolveMarriageTarget(bot, rawInput) {
  const input = String(rawInput ?? "").trim();
  if (!input) return null;

  const roomUser = bot.findRoomUser(input);
  if (roomUser?.userId != null) {
    return {
      userId: String(roomUser.userId),
      label:
        roomUser.displayName ?? roomUser.username ?? String(roomUser.userId),
      user: roomUser,
    };
  }

  const normalized = input.replace(/^@/, "").trim();
  if (!normalized) return null;
  return {
    userId: normalized,
    label: normalized,
    user: null,
  };
}

export default {
  name: "marriage",
  aliases: ["casamento", "casar"],
  descriptionKey: "commands.economy.marriage.description",
  usageKey: "commands.economy.marriage.usage",
  cooldown: 4000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, sender, args, reply, send, t, mention, mentionUser } = ctx;
    pruneExpiredProposals();

    const userId = sender?.userId != null ? String(sender.userId) : "";
    if (!userId) {
      await safeReply(reply, send, t("commands.economy.marriage.noUser"));
      return;
    }

    const action = normalizeAction(args[0]);
    const selfIdentity = bot._getUserIdentity(userId, sender);

    if (action === "accept") {
      const proposal = PENDING_PROPOSALS.get(userId);
      if (!proposal) {
        await safeReply(reply, send, t("commands.economy.marriage.noProposal"));
        return;
      }

      const proposerState = await bot.getMarriageState(proposal.fromId);
      const receiverState = await bot.getMarriageState(userId);
      if (
        Number(proposerState?.divorcePenaltyUntil ?? 0) > Date.now() ||
        Number(receiverState?.divorcePenaltyUntil ?? 0) > Date.now()
      ) {
        PENDING_PROPOSALS.delete(userId);
        await safeReply(
          reply,
          send,
          t("commands.economy.marriage.penaltyActive"),
        );
        return;
      }
      if (proposerState?.isMarried || receiverState?.isMarried) {
        PENDING_PROPOSALS.delete(userId);
        await safeReply(
          reply,
          send,
          t("commands.economy.marriage.alreadyMarried"),
        );
        return;
      }
      PENDING_PROPOSALS.delete(userId);

      const key = buildCoupleKey(proposal.fromId, userId);
      if (getActiveObjection()) {
        await safeReply(
          reply,
          send,
          t("commands.economy.marriage.objectionInProgress"),
        );
        return;
      }
      if (PENDING_OBJECTIONS.has(key)) {
        await safeReply(
          reply,
          send,
          t("commands.economy.marriage.objectionInProgress"),
        );
        return;
      }

      const partnerUser = bot._roomUsers.get(proposal.fromId) ?? null;
      const userAName =
        partnerUser?.displayName ??
        partnerUser?.username ??
        proposal.fromName ??
        String(proposal.fromId);
      const userBName =
        sender?.displayName ?? sender?.username ?? String(sender?.userId ?? "");

      const requiredVotes = Math.max(
        1,
        Math.floor(Number(bot.cfg.marriageObjectionVotesToCancel ?? 3) || 3),
      );
      const objectionWindowMs = Math.max(
        15_000,
        Number(bot.cfg.marriageObjectionWindowMs ?? 30_000) || 30_000,
      );

      const objection = {
        userAId: String(proposal.fromId),
        userBId: String(userId),
        userAName,
        userBName,
        requiredVotes,
        expiresAt: Date.now() + objectionWindowMs,
        votes: new Set(),
        timeoutId: null,
        closed: false,
      };

      objection.timeoutId = setTimeout(() => {
        finalizeObjection(bot, key).catch(() => {});
      }, objectionWindowMs);
      PENDING_OBJECTIONS.set(key, objection);

      await safeReply(
        reply,
        send,
        t("commands.economy.marriage.objectionStart", {
          left: mention(userAName),
          right: mention(userBName),
          required: requiredVotes,
          remaining: formatDuration(objectionWindowMs),
        }),
      );
      return;
    }

    if (action === "object") {
      const found = getActiveObjection();
      if (!found) {
        await safeReply(
          reply,
          send,
          t("commands.economy.marriage.objectionNone"),
        );
        return;
      }

      const { key, entry } = found;
      const voterId = String(userId);
      if (
        voterId === String(entry.userAId) ||
        voterId === String(entry.userBId)
      ) {
        await safeReply(
          reply,
          send,
          t("commands.economy.marriage.objectionCoupleCannotVote"),
        );
        return;
      }

      if (entry.votes.has(voterId)) {
        await safeReply(
          reply,
          send,
          t("commands.economy.marriage.objectionAlreadyVoted"),
        );
        return;
      }

      entry.votes.add(voterId);
      const votes = entry.votes.size;
      const missing = Math.max(0, entry.requiredVotes - votes);
      await safeReply(
        reply,
        send,
        t("commands.economy.marriage.objectionVoteRegistered", {
          votes,
          required: entry.requiredVotes,
          missing,
        }),
      );

      if (votes >= entry.requiredVotes) {
        await finalizeObjection(bot, key);
      }
      return;
    }

    if (action === "reject") {
      const proposal = PENDING_PROPOSALS.get(userId);
      if (!proposal) {
        await safeReply(reply, send, t("commands.economy.marriage.noProposal"));
        return;
      }
      PENDING_PROPOSALS.delete(userId);
      await safeReply(
        reply,
        send,
        t("commands.economy.marriage.rejected", {
          from: mention(proposal.fromName ?? String(proposal.fromId)),
        }),
      );
      return;
    }

    if (action === "status") {
      const state = await bot.getMarriageState(userId);
      const incoming = PENDING_PROPOSALS.get(userId);
      const outgoing = findOutgoingProposal(userId);
      const objection = findObjectionByUserId(userId);

      if (state?.isMarried && state.spouseUserId) {
        const spouse = bot._roomUsers.get(String(state.spouseUserId)) ?? null;
        const spouseName =
          spouse?.displayName ?? spouse?.username ?? String(state.spouseUserId);
        const selfName =
          sender?.displayName ?? sender?.username ?? String(userId);
        const marriedAt = Number(state.marriedAt ?? 0) || 0;
        const since = marriedAt
          ? new Date(marriedAt).toLocaleDateString(ctx.locale ?? "pt-BR")
          : "-";

        if (bot.cfg.imageRenderingEnabled && process.env.IMGBB_API_KEY) {
          try {
            const together = marriedAt
              ? formatDuration(Math.max(0, Date.now() - marriedAt))
              : "-";
            const card = renderMarriageStatusCard({
              partnerA: selfName,
              partnerB: spouseName,
              marriedAt,
              together,
              locale: ctx.locale ?? "pt-BR",
              labels: {
                title: t("commands.economy.marriage.statusCard.title"),
                subtitle: t("commands.economy.marriage.statusCard.subtitle"),
                partner: t("commands.economy.marriage.statusCard.partner"),
                since: t("commands.economy.marriage.statusCard.since"),
                together: t("commands.economy.marriage.statusCard.together"),
              },
            });
            const url = await uploadToImgbb(card, `marriage-status-${userId}`);
            await send(url);
            return;
          } catch {
            // fallback to text
          }
        }

        await safeReply(
          reply,
          send,
          t("commands.economy.marriage.statusMarried", {
            partner: mention(spouseName),
            since,
          }),
        );
        return;
      }

      if (incoming) {
        const remaining = Math.max(0, Number(incoming.expiresAt) - Date.now());
        await safeReply(
          reply,
          send,
          t("commands.economy.marriage.statusPendingIncoming", {
            from: mention(incoming.fromName ?? String(incoming.fromId)),
            remaining: formatDuration(remaining),
          }),
        );
        return;
      }

      if (outgoing) {
        const remaining = Math.max(0, Number(outgoing.expiresAt) - Date.now());
        await safeReply(
          reply,
          send,
          t("commands.economy.marriage.statusPendingOutgoing", {
            to: mention(outgoing.toName ?? String(outgoing.toId)),
            remaining: formatDuration(remaining),
          }),
        );
        return;
      }

      if (objection?.entry) {
        const remaining = Math.max(
          0,
          Number(objection.entry.expiresAt) - Date.now(),
        );
        await safeReply(
          reply,
          send,
          t("commands.economy.marriage.objectionStatus", {
            left: mention(objection.entry.userAName),
            right: mention(objection.entry.userBName),
            votes: objection.entry.votes.size,
            required: objection.entry.requiredVotes,
            remaining: formatDuration(remaining),
          }),
        );
        return;
      }

      const penaltyUntil = Number(state?.divorcePenaltyUntil ?? 0) || 0;
      if (penaltyUntil > Date.now()) {
        await safeReply(
          reply,
          send,
          t("commands.economy.marriage.statusPenalty", {
            remaining: formatDuration(penaltyUntil - Date.now()),
          }),
        );
        return;
      }

      await safeReply(reply, send, t("commands.economy.marriage.statusSingle"));
      return;
    }

    if (action === "divorce") {
      const state = await bot.getMarriageState(userId);
      const spouseId = String(state?.spouseUserId ?? "");
      if (!state?.isMarried || !spouseId) {
        await safeReply(reply, send, t("commands.economy.marriage.notMarried"));
        return;
      }

      const spouse = bot._roomUsers.get(spouseId) ?? null;
      const spouseIdentity = bot._getUserIdentity(spouseId, spouse);
      const spouseName = spouse?.displayName ?? spouse?.username ?? spouseId;
      const marriedAt = Number(state?.marriedAt ?? 0) || 0;
      const divorcedAt = Date.now();

      const currentBalance = await bot.getEconomyBalance(userId, selfIdentity);
      const transferHalf = Math.floor(
        Math.max(0, Number(currentBalance) || 0) / 2,
      );
      if (transferHalf > 0) {
        await bot.transferEconomyPoints(
          userId,
          spouseId,
          transferHalf,
          selfIdentity,
          spouseIdentity,
        );
      }

      const penaltyDays = Math.max(
        1,
        Number(bot.cfg.marriageDivorcePenaltyDays ?? 3) || 3,
      );
      const penaltyUntil = Date.now() + penaltyDays * 24 * 60 * 60 * 1000;
      await divorceMarriage({
        initiatorUserId: userId,
        partnerUserId: spouseId,
        penaltyUntil,
      });

      await safeReply(
        reply,
        send,
        t("commands.economy.marriage.divorced", {
          partner: mentionUser(spouse ?? { userId: spouseId }, spouseName),
          amount: formatPoints(transferHalf),
          penalty: formatDuration(penaltyUntil - Date.now()),
        }),
      );

      if (bot.cfg.imageRenderingEnabled && process.env.IMGBB_API_KEY) {
        try {
          const selfName =
            sender?.displayName ?? sender?.username ?? String(userId);
          const together = marriedAt
            ? formatDuration(Math.max(0, divorcedAt - marriedAt))
            : "-";
          const card = await renderDivorceCertificate({
            partnerA: selfName,
            partnerB: spouseName,
            marriedAt: marriedAt || divorcedAt,
            divorcedAt,
            together,
            locale: ctx.locale ?? "pt-BR",
            labels: {
              title: t("commands.economy.marriage.divorceCertificate.title"),
              subtitle: t(
                "commands.economy.marriage.divorceCertificate.subtitle",
              ),
              marriedDate: t(
                "commands.economy.marriage.divorceCertificate.marriedDate",
              ),
              divorceDate: t(
                "commands.economy.marriage.divorceCertificate.divorceDate",
              ),
              together: t(
                "commands.economy.marriage.divorceCertificate.together",
              ),
            },
          });
          const url = await uploadToImgbb(
            card,
            `marriage-divorce-${userId}-${spouseId}`,
          );
          await send(url);
        } catch {
          // noop
        }
      }
      return;
    }

    if (action === "annul") {
      if (Number(ctx.senderRoleLevel ?? 0) < JUDGE_MIN_LEVEL) {
        await safeReply(
          reply,
          send,
          t("commands.economy.marriage.judgeNoPermission"),
        );
        return;
      }

      const targetInput = String(args[1] ?? "").trim();
      if (!targetInput) {
        await safeReply(reply, send, t("commands.economy.marriage.judgeUsage"));
        return;
      }

      const resolved = resolveMarriageTarget(bot, targetInput);
      if (!resolved?.userId) {
        await safeReply(
          reply,
          send,
          t("commands.economy.marriage.userNotFound", {
            user: mention(targetInput),
          }),
        );
        return;
      }

      const state = await bot.getMarriageState(resolved.userId);
      const spouseId = String(state?.spouseUserId ?? "");
      if (!state?.isMarried || !spouseId) {
        await safeReply(
          reply,
          send,
          t("commands.economy.marriage.judgeNotMarried"),
        );
        return;
      }

      const spouse = bot._roomUsers.get(spouseId) ?? null;
      const spouseName = spouse?.displayName ?? spouse?.username ?? spouseId;
      const marriedAt = Number(state?.marriedAt ?? 0) || 0;
      const divorcedAt = Date.now();

      await divorceMarriage({
        initiatorUserId: resolved.userId,
        partnerUserId: spouseId,
        penaltyUntil: 0,
      });

      const objectionKey = buildCoupleKey(resolved.userId, spouseId);
      const objection = PENDING_OBJECTIONS.get(objectionKey);
      if (objection?.timeoutId) clearTimeout(objection.timeoutId);
      PENDING_OBJECTIONS.delete(objectionKey);

      await safeReply(
        reply,
        send,
        t("commands.economy.marriage.judgeAnnulled", {
          left: mention(resolved.label),
          right: mention(spouseName),
        }),
      );

      if (bot.cfg.imageRenderingEnabled && process.env.IMGBB_API_KEY) {
        try {
          const together = marriedAt
            ? formatDuration(Math.max(0, divorcedAt - marriedAt))
            : "-";
          const card = await renderDivorceCertificate({
            partnerA: resolved.label,
            partnerB: spouseName,
            marriedAt: marriedAt || divorcedAt,
            divorcedAt,
            together,
            locale: ctx.locale ?? "pt-BR",
            labels: {
              title: t("commands.economy.marriage.divorceCertificate.title"),
              subtitle: t(
                "commands.economy.marriage.divorceCertificate.subtitle",
              ),
              marriedDate: t(
                "commands.economy.marriage.divorceCertificate.marriedDate",
              ),
              divorceDate: t(
                "commands.economy.marriage.divorceCertificate.divorceDate",
              ),
              together: t(
                "commands.economy.marriage.divorceCertificate.together",
              ),
            },
          });
          const url = await uploadToImgbb(
            card,
            `marriage-annul-${resolved.userId}-${spouseId}`,
          );
          await send(url);
        } catch {
          // noop
        }
      }
      return;
    }

    const targetInput = String(args[0] ?? "").trim();
    if (!targetInput) {
      await safeReply(reply, send, t("commands.economy.marriage.usageMessage"));
      return;
    }

    const target = bot.findRoomUser(targetInput);
    if (!target) {
      await safeReply(
        reply,
        send,
        t("commands.economy.marriage.userNotFound", {
          user: mention(targetInput),
        }),
      );
      return;
    }

    const targetId = String(target.userId ?? "");
    if (!targetId || targetId === userId) {
      await safeReply(reply, send, t("commands.economy.marriage.self"));
      return;
    }

    if (bot.isBotUser(targetId)) {
      await safeReply(reply, send, t("commands.economy.marriage.targetBot"));
      return;
    }

    const myState = await bot.getMarriageState(userId);
    const targetState = await bot.getMarriageState(targetId);
    if (getActiveObjection()) {
      await safeReply(
        reply,
        send,
        t("commands.economy.marriage.objectionInProgress"),
      );
      return;
    }
    if (
      Number(myState?.divorcePenaltyUntil ?? 0) > Date.now() ||
      Number(targetState?.divorcePenaltyUntil ?? 0) > Date.now()
    ) {
      await safeReply(
        reply,
        send,
        t("commands.economy.marriage.penaltyActive"),
      );
      return;
    }
    if (myState?.isMarried || targetState?.isMarried) {
      await safeReply(
        reply,
        send,
        t("commands.economy.marriage.alreadyMarried"),
      );
      return;
    }

    if (PENDING_PROPOSALS.has(targetId)) {
      await safeReply(
        reply,
        send,
        t("commands.economy.marriage.targetHasProposal"),
      );
      return;
    }

    if (findOutgoingProposal(userId)) {
      await safeReply(
        reply,
        send,
        t("commands.economy.marriage.outgoingExists"),
      );
      return;
    }

    const timeoutMs = Math.max(
      30_000,
      Number(bot.cfg.marriageProposalTimeoutMs ?? 120_000) || 120_000,
    );

    const proposal = {
      fromId: userId,
      fromName: sender?.displayName ?? sender?.username ?? userId,
      toId: targetId,
      toName: target.displayName ?? target.username ?? targetId,
      createdAt: Date.now(),
      expiresAt: Date.now() + timeoutMs,
    };

    PENDING_PROPOSALS.set(targetId, proposal);

    await safeReply(
      reply,
      send,
      t("commands.economy.marriage.proposed", {
        from: mentionUser(
          sender,
          sender?.displayName ?? sender?.username ?? userId,
        ),
        to: mentionUser(target, targetInput),
        remaining: formatDuration(timeoutMs),
      }),
    );
  },
};
