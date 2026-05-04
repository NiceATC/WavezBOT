import { formatPoints, toPointsInt } from "../../helpers/points.js";
import { renderProfileCard } from "../../helpers/profile-card.js";
import { uploadToImgbb } from "../../helpers/imgbb.js";
import { getVipLevelLabel } from "../../lib/vip.js";

export default {
  name: "perfil",
  aliases: ["profile", "xp", "level"],
  descriptionKey: "commands.xp.perfil.description",
  usageKey: "commands.xp.perfil.usage",
  cooldown: 5000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, args, sender, reply, send, t, mention, mentionUser } = ctx;
    if (!bot.cfg.xpEnabled) {
      await reply(t("commands.xp.perfil.disabled"));
      return;
    }

    const targetInput = (
      args[0] ??
      sender.username ??
      sender.displayName ??
      ""
    ).trim();

    if (!targetInput) {
      await reply(t("commands.xp.perfil.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(targetInput);
    if (!user) {
      await reply(
        t("commands.xp.perfil.userNotFound", { user: mention(targetInput) }),
      );
      return;
    }

    const identity = {
      username: user.username ?? null,
      displayName: user.displayName ?? null,
    };
    const profile = await bot.getXpProfile(user.userId, identity);
    if (!profile) {
      await reply(
        t("commands.xp.perfil.noRecord", {
          user: mentionUser(user, targetInput),
        }),
      );
      return;
    }

    const balance = await bot.getEconomyBalance(user.userId, identity);
    const vipState = await bot.getVipState(user.userId, identity);
    const vipLabel = vipState.isActive
      ? getVipLevelLabel(vipState.levelKey, ctx.locale)
      : null;
    const marriage = await bot.getMarriageState(user.userId);
    const spouseId = String(marriage?.spouseUserId ?? "");
    const spouse = spouseId ? (bot._roomUsers.get(spouseId) ?? null) : null;
    const spouseName = spouse
      ? (spouse.displayName ?? spouse.username ?? spouseId)
      : spouseId;
    const marriageSince = Number(marriage?.marriedAt ?? 0)
      ? new Date(Number(marriage.marriedAt)).toLocaleDateString(
          ctx.locale ?? "pt-BR",
        )
      : "";
    const marriageText = marriage?.isMarried
      ? t("commands.xp.perfil.married", {
          partner: spouseName || "-",
          since: marriageSince || "-",
        })
      : null;

    if (bot.cfg.imageRenderingEnabled && process.env.IMGBB_API_KEY) {
      try {
        const labels = {
          title: t("commands.xp.perfil.cardTitle"),
          level: t("commands.xp.perfil.cardLevel"),
          xp: t("commands.xp.perfil.cardXp"),
          reward: t("commands.xp.perfil.cardReward"),
          balance: t("commands.xp.perfil.cardBalance"),
          vip: t("commands.xp.perfil.cardVip"),
          marriage: t("commands.xp.perfil.cardMarriage"),
          points: t("commands.xp.perfil.cardPoints"),
        };
        const buffer = renderProfileCard({
          username: identity.displayName ?? identity.username ?? "User",
          level: profile.level,
          xp: profile.xp,
          nextReq: profile.nextReq,
          rewardPoints: toPointsInt(profile.rewardNext),
          balance,
          vipLabel,
          vipLevelKey: vipState.levelKey,
          marriageLabel: marriage?.isMarried
            ? t("commands.xp.perfil.cardMarriage")
            : null,
          marriageValue: marriage?.isMarried ? spouseName || "-" : null,
          labels,
        });
        const url = await uploadToImgbb(buffer, `perfil-${user.userId}`);
        await send(url);
        return;
      } catch {
        // fall back to text
      }
    }

    const base = t("commands.xp.perfil.reply", {
      user: mentionUser(user, targetInput),
      level: profile.level,
      xp: formatPoints(profile.xp),
      next: formatPoints(profile.nextReq),
      remaining: formatPoints(profile.remaining),
      reward: formatPoints(toPointsInt(profile.rewardNext)),
      balance: formatPoints(balance),
    });
    const extras = [];
    if (profile.nextBadge) {
      extras.push(
        t("commands.xp.perfil.nextBadge", {
          badge: profile.nextBadge,
        }),
      );
    }
    if (profile.nextAchievement) {
      extras.push(
        t("commands.xp.perfil.nextAchievement", {
          achievement: profile.nextAchievement,
        }),
      );
    }
    if (marriageText) extras.push(marriageText);
    const message = extras.length ? `${base} | ${extras.join(" | ")}` : base;
    await reply(message);
  },
};
