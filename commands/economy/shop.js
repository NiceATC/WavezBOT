import {
  formatPoints,
  POINT_SCALE,
  toPointsInt,
} from "../../helpers/points.js";
import { sendChatChunks } from "../../helpers/chat.js";
import { formatDuration } from "../../helpers/time.js";
import { addShopPurchase, getShopPurchase } from "../../lib/storage.js";
import { getRoleLevel } from "../../lib/permissions.js";
import {
  buildVipPlans,
  normalizeVipDuration,
  normalizeVipLevel,
} from "../../lib/vip.js";
import {
  getQueueEntryUserId,
  getWaitlistPositionForIndex,
} from "../../lib/waitlist.js";

function normalizeItems(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const key = String(item.key ?? "").trim();
      if (!key) return null;
      const price = Number(item.price ?? 0) || 0;
      const type = String(item.type ?? "message").trim();
      return { ...item, key, price, type };
    })
    .filter(Boolean);
}

function resolveItemName(bot, item) {
  const raw = item?.name ?? item?.key ?? "item";
  const name = bot.localizeValue(raw);
  return String(name ?? item?.key ?? "item");
}

function resolveItemDesc(bot, item) {
  const raw = item?.description ?? "";
  const desc = bot.localizeValue(raw);
  const text = String(desc ?? "").trim();
  return text ? ` — ${text}` : "";
}

function findItem(items, query, bot) {
  const needle = String(query ?? "")
    .trim()
    .toLowerCase();
  if (!needle) return null;
  return (
    items.find((item) => item.key.toLowerCase() === needle) ||
    items.find((item) => resolveItemName(bot, item).toLowerCase() === needle) ||
    null
  );
}

function getShopItems(bot) {
  const base = normalizeItems(bot.cfg.shopItems);
  const vipItems = normalizeItems(buildVipPlans(bot.cfg));
  return [...base, ...vipItems];
}

function resolveBuyTarget(bot, args) {
  const items = getShopItems(bot);
  const first = String(args[0] ?? "")
    .trim()
    .toLowerCase();
  if (!first) return { items, item: null, reason: "usage" };

  if (first !== "vip") {
    return {
      items,
      item: findItem(items, first, bot),
      reason: "item",
      query: first,
    };
  }

  const tokens = args
    .slice(1)
    .map((token) =>
      String(token ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  const levelKey = tokens.map(normalizeVipLevel).find(Boolean) ?? "bronze";
  const durationKey = tokens.map(normalizeVipDuration).find(Boolean) ?? null;
  if (!durationKey) {
    return {
      items,
      item: null,
      reason: "vip_usage",
    };
  }

  const item =
    items.find(
      (candidate) =>
        candidate.type === "vip" &&
        candidate.vipLevel === levelKey &&
        candidate.vipDuration === durationKey,
    ) ?? null;
  return {
    items,
    item,
    reason: "vip",
    vipLevel: levelKey,
    vipDuration: durationKey,
  };
}

const shop = {
  name: "shop",
  aliases: ["loja"],
  descriptionKey: "commands.economy.shop.description",
  usageKey: "commands.economy.shop.usage",
  cooldown: 4000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, reply, t, sender } = ctx;
    if (!bot.cfg.economyEnabled) {
      await reply(t("commands.economy.shop.disabled"));
      return;
    }

    const items = getShopItems(bot);
    if (!items.length) {
      await reply(t("commands.economy.shop.empty"));
      return;
    }

    const userId = sender?.userId ?? null;
    const identity =
      userId != null ? bot._getUserIdentity(userId, sender) : null;
    const lines = await Promise.all(
      items.map(async (item) => {
        const name = resolveItemName(bot, item);
        const desc = resolveItemDesc(bot, item);
        const priceInt =
          userId != null
            ? await bot.getVipAdjustedShopPriceInt(
                userId,
                item.price,
                identity,
                {
                  itemType: item.type,
                },
              )
            : toPointsInt(item.price);
        return t("commands.economy.shop.line", {
          key: item.key,
          name,
          price: formatPoints(priceInt),
          description: desc,
        });
      }),
    );

    await sendChatChunks(
      reply,
      t("commands.economy.shop.list", { items: lines.join(" | ") }),
    );
  },
};

const buy = {
  name: "buy",
  aliases: ["comprar"],
  descriptionKey: "commands.economy.buy.description",
  usageKey: "commands.economy.buy.usage",
  cooldown: 3000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, api, sender, args, reply, t } = ctx;
    if (!bot.cfg.economyEnabled) {
      await reply(t("commands.economy.buy.disabled"));
      return;
    }

    const userId = sender.userId;
    if (userId == null) {
      await reply(t("commands.economy.buy.noUser"));
      return;
    }

    const target = resolveBuyTarget(bot, args);
    if (target.reason === "usage") {
      await reply(t("commands.economy.buy.usageMessage"));
      return;
    }

    const { item } = target;
    if (target.reason === "vip_usage") {
      await reply(t("commands.economy.buy.vipUsageMessage"));
      return;
    }
    if (!item) {
      if (target.reason === "vip") {
        await reply(
          t("commands.economy.buy.vipNotFound", {
            level: target.vipLevel,
            duration: target.vipDuration,
          }),
        );
      } else {
        await reply(
          t("commands.economy.buy.notFound", { item: target.query ?? "" }),
        );
      }
      return;
    }

    const identity = bot._getUserIdentity(userId, sender);

    if (item.oneTime) {
      const prior = await getShopPurchase(userId, item.key);
      if (prior?.quantity) {
        await reply(t("commands.economy.buy.alreadyOwned", { item: item.key }));
        return;
      }
    }

    const priceInt = await bot.getVipAdjustedShopPriceInt(
      userId,
      item.price ?? 0,
      identity,
      {
        itemType: item.type,
      },
    );
    if (!priceInt || priceInt <= 0) {
      await reply(t("commands.economy.buy.invalidItem"));
      return;
    }

    const balance = await bot.getEconomyBalance(userId, identity);
    if (balance < priceInt) {
      await reply(
        t("commands.economy.buy.insufficient", {
          balance: formatPoints(balance),
        }),
      );
      return;
    }

    if (item.type === "moveUp" || item.type === "moveTo") {
      if (bot.getBotRoleLevel() < getRoleLevel("bouncer")) {
        await reply(t("commands.economy.buy.noPermission"));
        return;
      }
      const qRes = await api.room
        .getQueueStatus(bot.cfg.room)
        .catch(() => null);
      const entries = Array.isArray(qRes?.data?.entries)
        ? qRes.data.entries
        : [];
      const index = entries.findIndex(
        (entry) => getQueueEntryUserId(entry) === String(userId),
      );
      const currentPos = getWaitlistPositionForIndex(index, entries);
      if (currentPos == null) {
        await reply(t("commands.economy.buy.notInQueue"));
        return;
      }

      let targetPos = currentPos - 1;
      if (item.type === "moveUp") {
        const positions = Math.max(1, Math.floor(Number(item.positions) || 1));
        targetPos = Math.max(0, targetPos - positions);
      } else {
        const pos = Math.max(1, Math.floor(Number(item.position) || 1));
        targetPos = Math.max(0, pos - 1);
      }

      if (targetPos === currentPos - 1) {
        await reply(t("commands.economy.buy.noMove"));
        return;
      }

      const spent = await bot.spendEconomyPoints(
        userId,
        priceInt / POINT_SCALE,
        identity,
        { allowMarriagePool: true },
      );
      if (spent == null) {
        await reply(
          t("commands.economy.buy.insufficient", {
            balance: formatPoints(balance),
          }),
        );
        return;
      }

      try {
        bot.wsReorderQueue(userId, targetPos);
        await addShopPurchase(userId, item.key, 1);
        await reply(
          t("commands.economy.buy.success", {
            item: resolveItemName(bot, item),
          }),
        );
        return;
      } catch (err) {
        await bot.awardEconomyPoints(userId, priceInt / POINT_SCALE, identity, {
          applyVipMultiplier: false,
        });
        await reply(t("commands.economy.buy.failed", { error: err.message }));
        return;
      }
    }

    if (item.type === "vip") {
      const spent = await bot.spendEconomyPoints(
        userId,
        priceInt / POINT_SCALE,
        identity,
        { allowMarriagePool: true },
      );
      if (spent == null) {
        await reply(
          t("commands.economy.buy.insufficient", {
            balance: formatPoints(balance),
          }),
        );
        return;
      }

      const vipResult = await bot.purchaseVip(
        userId,
        {
          levelKey: item.vipLevel,
          durationMs: item.vipDurationMs,
          durationKey: item.vipDuration,
        },
        identity,
      );

      if (!vipResult?.ok) {
        await bot.awardEconomyPoints(userId, priceInt / POINT_SCALE, identity, {
          applyVipMultiplier: false,
        });
        if (vipResult?.code === "higher_level_active") {
          await reply(t("commands.economy.buy.vipHigherLevel"));
          return;
        }
        await reply(t("commands.economy.buy.vipActivateFailed"));
        return;
      }

      await addShopPurchase(userId, item.key, 1);
      const remainingMs = Math.max(
        0,
        Number(vipResult.expiresAt ?? 0) - Date.now(),
      );
      await reply(
        t("commands.economy.buy.vipSuccess", {
          item: resolveItemName(bot, item),
          remaining: formatDuration(remainingMs),
        }),
      );
      return;
    }

    const spent = await bot.spendEconomyPoints(
      userId,
      priceInt / POINT_SCALE,
      identity,
      { allowMarriagePool: true },
    );
    if (spent == null) {
      await reply(
        t("commands.economy.buy.insufficient", {
          balance: formatPoints(balance),
        }),
      );
      return;
    }

    await addShopPurchase(userId, item.key, 1);
    const extra = resolveItemDesc(bot, item);
    await reply(
      t("commands.economy.buy.success", {
        item: resolveItemName(bot, item),
        extra,
      }),
    );
  },
};

export default [shop, buy];
