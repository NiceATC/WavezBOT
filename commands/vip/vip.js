import { uploadToImgbb } from "../../helpers/imgbb.js";
import { formatDuration } from "../../helpers/time.js";
import { formatPoints, toPointsInt } from "../../helpers/points.js";
import {
  renderVipPlansCard,
  renderVipStatusCard,
} from "../../helpers/vip-card.js";
import {
  buildVipPlans,
  getVipDurationLabel,
  getVipLevelLabel,
  normalizeVipDuration,
  normalizeVipLevel,
} from "../../lib/vip.js";

function formatMultiplier(mult) {
  return Number(mult ?? 1)
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
}

function canRenderImage(bot) {
  return Boolean(bot.cfg.imageRenderingEnabled && process.env.IMGBB_API_KEY);
}

const VIP_GREET_MAX_LEN = 120;

function validateVipGreetMessage(input, t) {
  const text = String(input ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return { ok: false, error: t("commands.vip.vip.greetEmpty") };
  }
  if (text.length > VIP_GREET_MAX_LEN) {
    return {
      ok: false,
      error: t("commands.vip.vip.greetTooLong", { max: VIP_GREET_MAX_LEN }),
    };
  }
  if (/@|https?:\/\/|www\./i.test(text)) {
    return {
      ok: false,
      error: t("commands.vip.vip.greetNoMentionsLinks"),
    };
  }
  if (/[<>]/.test(text)) {
    return {
      ok: false,
      error: t("commands.vip.vip.greetNoAngleBrackets"),
    };
  }
  const invalidPlaceholder = text
    .match(/\{([^}]+)\}/g)
    ?.find((token) => !["{name}", "{username}"].includes(token));
  if (invalidPlaceholder) {
    return {
      ok: false,
      error: t("commands.vip.vip.greetInvalidPlaceholder"),
    };
  }
  return { ok: true, value: text };
}

async function sendPlansCard(ctx, plans) {
  const { bot, sender, send, reply, t, locale } = ctx;

  const durationOrder = { daily: 1, weekly: 2, monthly: 3, yearly: 4 };
  const levelOrder = { bronze: 1, silver: 2, gold: 3 };
  const byLevel = new Map();

  for (const plan of plans) {
    const levelKey = String(plan?.vipLevel ?? "").toLowerCase();
    if (!levelKey) continue;
    if (!byLevel.has(levelKey)) {
      const levelName = getVipLevelLabel(
        levelKey,
        locale ?? bot.locale ?? "pt-BR",
      );
      byLevel.set(levelKey, {
        levelKey,
        name: levelName.replace(/^VIP\s+/i, ""),
        benefits: bot.localizeValue(plan.description),
        durations: [],
      });
    }
    const group = byLevel.get(levelKey);
    group.durations.push({
      key: plan.key,
      durationKey: plan.vipDuration,
      label: getVipDurationLabel(
        plan.vipDuration,
        locale ?? bot.locale ?? "pt-BR",
      ),
      price: `${formatPoints(toPointsInt(plan.price))} pts`,
    });
  }

  const vipCards = Array.from(byLevel.values())
    .map((group) => ({
      ...group,
      durations: group.durations.sort(
        (a, b) =>
          (durationOrder[a.durationKey] ?? 99) -
          (durationOrder[b.durationKey] ?? 99),
      ),
    }))
    .sort(
      (a, b) => (levelOrder[a.levelKey] ?? 99) - (levelOrder[b.levelKey] ?? 99),
    );

  if (canRenderImage(bot)) {
    try {
      const buffer = renderVipPlansCard({
        title: t("commands.vip.vip.cards.plansTitle"),
        subtitle: sender.displayName ?? sender.username ?? "Usuario",
        vipCards,
        footer: t("commands.vip.vip.cards.plansFooter"),
      });
      const url = await uploadToImgbb(buffer, `vip-plans-${sender.userId}`);
      await send(url);
      return true;
    } catch {
      // fallback to text below
    }
  }

  const lines = vipCards.map((card) => {
    const durations = card.durations
      .map((entry) => `${entry.label}: ${entry.price}`)
      .join(" ; ");
    return `${card.name} -> ${durations}`;
  });
  await reply(t("commands.vip.vip.plansReply", { lines: lines.join(" || ") }));
  return false;
}

async function sendStatusCard(ctx, state, balance, renewPlan) {
  const { bot, sender, send, reply, t, locale } = ctx;
  const benefits = bot.getVipBenefitsForLevel(state.levelKey);
  const benefitItems = [
    {
      label: t("commands.vip.vip.cards.benefits.xp"),
      value: `x${formatMultiplier(benefits.xpMultiplier)}`,
      accent: "#f59e0b",
    },
    {
      label: t("commands.vip.vip.cards.benefits.economy"),
      value: `x${formatMultiplier(benefits.economyMultiplier)}`,
      accent: "#22d3ee",
    },
    {
      label: t("commands.vip.vip.cards.benefits.daily"),
      value: `x${formatMultiplier(benefits.dailyMultiplier)}`,
      accent: "#38bdf8",
    },
    {
      label: t("commands.vip.vip.cards.benefits.work"),
      value: `x${formatMultiplier(benefits.workMultiplier)}`,
      accent: "#10b981",
    },
    {
      label: t("commands.vip.vip.cards.benefits.dcWindow"),
      value: `x${formatMultiplier(benefits.dcWindowMultiplier)}`,
      accent: "#f97316",
    },
    {
      label: t("commands.vip.vip.cards.benefits.shopAfk"),
      value: `-${benefits.shopDiscountPct}% / x${formatMultiplier(benefits.afkLimitMultiplier)}`,
      accent: "#a78bfa",
    },
  ];

  if (canRenderImage(bot)) {
    try {
      const buffer = renderVipStatusCard({
        username: sender.displayName ?? sender.username ?? "Usuario",
        levelKey: state.levelKey,
        title: t("commands.vip.vip.cards.statusTitle"),
        subtitle: `${getVipLevelLabel(state.levelKey, locale ?? bot.locale ?? "pt-BR")} | ${state.isActive ? t("commands.vip.vip.cards.statusActive") : t("commands.vip.vip.cards.statusExpired")}`,
        statusLabel: t("commands.vip.vip.cards.statusLabel"),
        statusValue: getVipLevelLabel(
          state.levelKey,
          locale ?? bot.locale ?? "pt-BR",
        ),
        expiresLabel: state.isActive
          ? t("commands.vip.vip.cards.expiresIn")
          : t("commands.vip.vip.cards.expiredAgo"),
        expiresValue: formatDuration(
          Math.max(0, Math.abs(Number(state.expiresAt ?? 0) - Date.now())),
        ),
        balanceLabel: t("commands.vip.vip.cards.balanceLabel"),
        balanceValue: `${formatPoints(balance)} pontos`,
        renewLabel: t("commands.vip.vip.cards.renewLabel"),
        renewValue: state.autoRenew
          ? t("commands.vip.vip.cards.renewAuto", {
              plan: renewPlan
                ? bot.localizeValue(renewPlan.name)
                : t("commands.vip.vip.cards.renewAutoEnabled"),
            })
          : renewPlan
            ? bot.localizeValue(renewPlan.name)
            : t("commands.vip.vip.cards.renewManual"),
        benefitItems,
      });
      const url = await uploadToImgbb(buffer, `vip-status-${sender.userId}`);
      await send(url);
      return true;
    } catch {
      // fallback below
    }
  }

  const remaining = Math.max(0, Number(state.expiresAt ?? 0) - Date.now());
  await reply(
    t("commands.vip.vip.statusReply", {
      level: String(state.levelKey).toUpperCase(),
      remaining: formatDuration(remaining),
      xp: formatMultiplier(benefits.xpMultiplier),
      economy: formatMultiplier(benefits.economyMultiplier),
      daily: formatMultiplier(benefits.dailyMultiplier),
      work: formatMultiplier(benefits.workMultiplier),
      dc: formatMultiplier(benefits.dcWindowMultiplier),
    }),
  );
  return false;
}

export default {
  name: "vip",
  aliases: ["vipstatus", "vipinfo"],
  descriptionKey: "commands.vip.vip.description",
  usageKey: "commands.vip.vip.usage",
  cooldown: 4000,
  deleteOn: 60000,

  async execute(ctx) {
    const { bot, sender, args, reply, t } = ctx;
    const userId = sender.userId;
    if (userId == null) {
      await reply(t("commands.vip.vip.noUser"));
      return;
    }

    if (!bot.cfg.vipEnabled) {
      await reply(t("commands.vip.vip.disabled"));
      return;
    }

    const sub = String(args[0] ?? "")
      .trim()
      .toLowerCase();
    const identity = bot._getUserIdentity(userId, sender);
    const state = await bot.getVipState(userId, identity);
    const renewPlan = await bot.getVipRenewPlan(userId, identity);

    if (["planos", "plans", "list"].includes(sub)) {
      const plans = buildVipPlans(bot.cfg);
      if (!plans.length) {
        await reply(t("commands.vip.vip.plansEmpty"));
        return;
      }
      await sendPlansCard(ctx, plans);
      return;
    }

    if (["renew", "renovar"].includes(sub)) {
      const result = await bot.renewVip(userId, identity);
      if (!result?.ok) {
        if (result?.code === "no_plan") {
          await reply(t("commands.vip.vip.renewNoPlan"));
          return;
        }
        if (result?.code === "insufficient") {
          await reply(
            t("commands.vip.vip.renewInsufficient", {
              plan: bot.localizeValue(result.plan?.name ?? "VIP"),
              price: formatPoints(result.priceInt),
              balance: formatPoints(result.balance ?? 0),
            }),
          );
          return;
        }
        await reply(t("commands.vip.vip.renewFailed"));
        return;
      }

      await reply(
        t("commands.vip.vip.renewSuccess", {
          plan: bot.localizeValue(result.plan.name),
          remaining: formatDuration(
            Math.max(0, Number(result.expiresAt ?? 0) - Date.now()),
          ),
        }),
      );
      return;
    }

    if (["autorenew", "auto", "renovacao"].includes(sub)) {
      const mode = String(args[1] ?? "")
        .trim()
        .toLowerCase();
      if (!["on", "off"].includes(mode)) {
        await reply(t("commands.vip.vip.autoUsage"));
        return;
      }

      const explicitLevel = normalizeVipLevel(args[2]);
      const explicitDuration = normalizeVipDuration(args[3]);
      const plan =
        explicitLevel && explicitDuration
          ? bot.getVipPlan(explicitLevel, explicitDuration)
          : (renewPlan ??
            (state.rawLevelKey
              ? bot.getVipPlan(
                  state.rawLevelKey,
                  state.renewDurationKey ?? "monthly",
                )
              : null));

      if (mode === "on" && !plan) {
        await reply(t("commands.vip.vip.autoNoPlan"));
        return;
      }

      await bot.setVipRenewal(
        userId,
        {
          autoRenew: mode === "on",
          levelKey: plan?.vipLevel ?? null,
          durationKey: plan?.vipDuration ?? null,
        },
        identity,
      );

      if (mode === "on") {
        await reply(
          t("commands.vip.vip.autoEnabled", {
            plan: bot.localizeValue(plan.name),
          }),
        );
        return;
      }

      await reply(t("commands.vip.vip.autoDisabled"));
      return;
    }

    if (["greet", "saudacao"].includes(sub)) {
      if (!state.isActive) {
        await reply(t("commands.vip.vip.greetVipOnly"));
        return;
      }

      const action = String(args[1] ?? "")
        .trim()
        .toLowerCase();
      if (!["set", "clear", "off", "show"].includes(action)) {
        await reply(
          t("commands.vip.vip.greetUsage", { max: VIP_GREET_MAX_LEN }),
        );
        return;
      }

      if (action === "show") {
        const current = await bot.getVipGreetMessage(userId, identity);
        await reply(
          current
            ? t("commands.vip.vip.greetShow", { message: current })
            : t("commands.vip.vip.greetShowEmpty"),
        );
        return;
      }

      if (action === "clear" || action === "off") {
        await bot.setVipGreet(userId, null, identity);
        await reply(t("commands.vip.vip.greetCleared"));
        return;
      }

      const rawMessage = args.slice(2).join(" ");
      const validation = validateVipGreetMessage(rawMessage, t);
      if (!validation.ok) {
        await reply(validation.error);
        return;
      }

      await bot.setVipGreet(userId, validation.value, identity);
      await reply(
        t("commands.vip.vip.greetSaved", { message: validation.value }),
      );
      return;
    }

    const balance = await bot.getEconomyBalance(userId, identity);
    if (!state.isActive) {
      const expiredText = state.isExpired
        ? t("commands.vip.vip.expiredWithPrevious", {
            elapsed: formatDuration(
              Math.max(0, Date.now() - Number(state.expiredAt ?? 0)),
            ),
          })
        : t("commands.vip.vip.noActive");
      const renewText = renewPlan
        ? ` ${t("commands.vip.vip.renewPlanSaved", {
            plan: bot.localizeValue(renewPlan.name),
          })}`
        : "";
      await reply(
        `${expiredText}${renewText} ${t("commands.vip.vip.statusHint")}`,
      );
      return;
    }

    await sendStatusCard(ctx, state, balance, renewPlan);
  },
};
