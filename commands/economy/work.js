import { formatDuration } from "../../helpers/time.js";
import { formatPoints, toPointsInt } from "../../helpers/points.js";
import { sendChatChunks } from "../../helpers/chat.js";
import { getWorkState, setWorkState } from "../../lib/storage.js";

function normalizeJobs(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((job) => {
      if (!job || typeof job !== "object") return null;
      const key = String(job.key ?? "").trim();
      if (!key) return null;
      const xpMin = Math.max(1, Math.floor(Number(job.xpMin) || 1));
      const pay = Number(job.pay ?? 0) || 0;
      return { ...job, key, xpMin, pay };
    })
    .filter(Boolean)
    .sort((a, b) => a.xpMin - b.xpMin);
}

function resolveJobName(bot, job) {
  const raw = job?.name ?? job?.key ?? "job";
  const name = bot.localizeValue(raw);
  return String(name ?? job?.key ?? "job");
}

async function getUserLevel(bot, userId, identity) {
  if (!bot.cfg.xpEnabled) return 1;
  const profile = await bot.getXpProfile(userId, identity);
  return profile?.level ?? 1;
}

const work = {
  name: "work",
  aliases: ["job", "trabalho"],
  descriptionKey: "commands.economy.work.description",
  usageKey: "commands.economy.work.usage",
  cooldown: 3000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, sender, args, reply, t } = ctx;
    if (!bot.cfg.economyEnabled) {
      await reply(t("commands.economy.work.disabled"));
      return;
    }

    const userId = sender.userId;
    if (userId == null) {
      await reply(t("commands.economy.work.noUser"));
      return;
    }

    const identity = bot._getUserIdentity(userId, sender);
    const jobs = normalizeJobs(bot.cfg.workJobs);
    if (!jobs.length) {
      await reply(t("commands.economy.work.empty"));
      return;
    }

    const action = String(args[0] ?? "")
      .trim()
      .toLowerCase();
    const state = await getWorkState(userId);
    const currentJob = jobs.find((job) => job.key === state?.jobKey) ?? null;
    const level = await getUserLevel(bot, userId, identity);

    if (!action || action === "status") {
      if (!currentJob) {
        await reply(t("commands.economy.work.noJob"));
        return;
      }

      const lastClaim = Number(state?.lastClaimAt ?? 0) || 0;
      const cooldownMs = Math.max(0, Number(bot.cfg.workCooldownMs) || 0);
      const remaining = lastClaim
        ? Math.max(0, cooldownMs - (Date.now() - lastClaim))
        : 0;

      await reply(
        t("commands.economy.work.status", {
          job: resolveJobName(bot, currentJob),
          pay: formatPoints(toPointsInt(currentJob.pay)),
          remaining: remaining
            ? formatDuration(remaining)
            : t("commands.economy.work.ready"),
        }),
      );
      return;
    }

    if (action === "list") {
      const lines = jobs.map((job) => {
        const name = resolveJobName(bot, job);
        const status =
          level >= job.xpMin
            ? t("commands.economy.work.available")
            : t("commands.economy.work.locked");
        return t("commands.economy.work.listLine", {
          key: job.key,
          name,
          xp: job.xpMin,
          pay: formatPoints(toPointsInt(job.pay)),
          status,
        });
      });
      await sendChatChunks(
        reply,
        t("commands.economy.work.list", { items: lines.join(" | ") }),
      );
      return;
    }

    if (action === "choose") {
      const key = String(args[1] ?? "").trim();
      if (!key) {
        await reply(t("commands.economy.work.chooseUsage"));
        return;
      }

      const job = jobs.find((j) => j.key.toLowerCase() === key.toLowerCase());
      if (!job) {
        await reply(t("commands.economy.work.jobNotFound", { job: key }));
        return;
      }

      if (level < job.xpMin) {
        await reply(
          t("commands.economy.work.jobLocked", {
            job: resolveJobName(bot, job),
            xp: job.xpMin,
          }),
        );
        return;
      }

      if (currentJob && currentJob.key === job.key) {
        await reply(t("commands.economy.work.alreadySelected"));
        return;
      }

      if (currentJob && job.xpMin <= currentJob.xpMin) {
        await reply(t("commands.economy.work.upgradeOnly"));
        return;
      }

      await setWorkState({
        userId,
        jobKey: job.key,
        lastClaimAt: state?.lastClaimAt ?? 0,
      });
      await reply(
        t("commands.economy.work.selected", {
          job: resolveJobName(bot, job),
        }),
      );
      return;
    }

    if (action === "claim") {
      if (!currentJob) {
        await reply(t("commands.economy.work.noJob"));
        return;
      }
      const cooldownMs = Math.max(0, Number(bot.cfg.workCooldownMs) || 0);
      const lastClaim = Number(state?.lastClaimAt ?? 0) || 0;
      if (lastClaim && Date.now() - lastClaim < cooldownMs) {
        const remaining = cooldownMs - (Date.now() - lastClaim);
        await reply(
          t("commands.economy.work.cooldown", {
            remaining: formatDuration(remaining),
          }),
        );
        return;
      }

      await bot.awardEconomyPoints(userId, currentJob.pay, identity, {
        applyVipMultiplier: true,
        source: "work",
      });
      await setWorkState({
        userId,
        jobKey: currentJob.key,
        lastClaimAt: Date.now(),
      });
      await reply(
        t("commands.economy.work.claimed", {
          job: resolveJobName(bot, currentJob),
          pay: formatPoints(toPointsInt(currentJob.pay)),
        }),
      );
      return;
    }

    await reply(t("commands.economy.work.usageMessage"));
  },
};

export default work;
