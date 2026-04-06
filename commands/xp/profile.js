import { formatPoints, toPointsInt } from "../../helpers/points.js";
import { renderProfileCard } from "../../helpers/profile-card.js";
import { uploadToImgbb } from "../../helpers/imgbb.js";

export default {
  name: "perfil",
  aliases: ["profile", "xp", "level"],
  descriptionKey: "commands.perfil.description",
  usageKey: "commands.perfil.usage",
  cooldown: 5000,

  async execute(ctx) {
    const { bot, args, sender, reply, t } = ctx;
    if (!bot.cfg.xpEnabled) {
      await reply(t("commands.perfil.disabled"));
      return;
    }

    const targetInput = (args[0] ?? sender.username ?? sender.displayName ?? "")
      .replace(/^@/, "")
      .trim();

    if (!targetInput) {
      await reply(t("commands.perfil.usageMessage"));
      return;
    }

    const user = bot.findRoomUser(targetInput);
    if (!user) {
      await reply(t("commands.perfil.userNotFound", { user: targetInput }));
      return;
    }

    const identity = {
      username: user.username ?? null,
      displayName: user.displayName ?? null,
    };
    const profile = await bot.getXpProfile(user.userId, identity);
    if (!profile) {
      await reply(
        t("commands.perfil.noRecord", {
          user: user.displayName ?? user.username ?? targetInput,
        }),
      );
      return;
    }

    const balance = await bot.getEconomyBalance(user.userId, identity);

    if (bot.cfg.imageRenderingEnabled && process.env.IMGBB_API_KEY) {
      try {
        const labels = {
          title: t("commands.perfil.cardTitle"),
          level: t("commands.perfil.cardLevel"),
          xp: t("commands.perfil.cardXp"),
          reward: t("commands.perfil.cardReward"),
          balance: t("commands.perfil.cardBalance"),
          points: t("commands.perfil.cardPoints"),
        };
        const buffer = renderProfileCard({
          username: identity.displayName ?? identity.username ?? "User",
          level: profile.level,
          xp: profile.xp,
          nextReq: profile.nextReq,
          rewardPoints: toPointsInt(profile.rewardNext),
          balance,
          labels,
        });
        const url = await uploadToImgbb(buffer, `perfil-${user.userId}`);
        await reply(url);
        return;
      } catch {
        // fall back to text
      }
    }

    const base = t("commands.perfil.reply", {
      user: user.displayName ?? user.username ?? targetInput,
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
        t("commands.perfil.nextBadge", {
          badge: profile.nextBadge,
        }),
      );
    }
    if (profile.nextAchievement) {
      extras.push(
        t("commands.perfil.nextAchievement", {
          achievement: profile.nextAchievement,
        }),
      );
    }
    const message = extras.length ? `${base} | ${extras.join(" | ")}` : base;
    await reply(message);
  },
};
