import { formatPoints, toPointsInt } from "../../helpers/points.js";
import { sendChatChunks } from "../../helpers/chat.js";
import { getWaitlist } from "../../helpers/waitlist.js";
import { addShopPurchase, getShopPurchase } from "../../lib/storage.js";
import { getRoleLevel } from "../../lib/permissions.js";

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

const shop = {
  name: "shop",
  aliases: ["loja"],
  descriptionKey: "commands.economy.shop.description",
  usageKey: "commands.economy.shop.usage",
  cooldown: 4000,
  deleteOn: 60_000,

  async execute(ctx) {
    const { bot, reply, t } = ctx;
    if (!bot.cfg.economyEnabled) {
      await reply(t("commands.economy.shop.disabled"));
      return;
    }

    const items = normalizeItems(bot.cfg.shopItems);
    if (!items.length) {
      await reply(t("commands.economy.shop.empty"));
      return;
    }

    const lines = items.map((item) => {
      const name = resolveItemName(bot, item);
      const desc = resolveItemDesc(bot, item);
      return t("commands.economy.shop.line", {
        key: item.key,
        name,
        price: formatPoints(toPointsInt(item.price)),
        description: desc,
      });
    });

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

    const key = args[0];
    if (!key) {
      await reply(t("commands.economy.buy.usageMessage"));
      return;
    }

    const items = normalizeItems(bot.cfg.shopItems);
    const item = findItem(items, key, bot);
    if (!item) {
      await reply(t("commands.economy.buy.notFound", { item: key }));
      return;
    }

    if (item.oneTime) {
      const prior = await getShopPurchase(userId, item.key);
      if (prior?.quantity) {
        await reply(t("commands.economy.buy.alreadyOwned", { item: item.key }));
        return;
      }
    }

    const priceInt = toPointsInt(item.price ?? 0);
    if (!priceInt || priceInt <= 0) {
      await reply(t("commands.economy.buy.invalidItem"));
      return;
    }

    const identity = bot._getUserIdentity(userId, sender);
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
      const waitlist = await getWaitlist(api, bot.cfg.room).catch(() => []);
      const index = waitlist.findIndex(
        (u) => String(u.id ?? u.userId ?? u.user_id ?? "") === String(userId),
      );
      if (index < 0) {
        await reply(t("commands.economy.buy.notInQueue"));
        return;
      }

      let targetPos = index;
      if (item.type === "moveUp") {
        const positions = Math.max(1, Math.floor(Number(item.positions) || 1));
        targetPos = Math.max(0, index - positions);
      } else {
        const pos = Math.max(1, Math.floor(Number(item.position) || 1));
        targetPos = Math.max(0, pos - 1);
      }

      if (targetPos === index) {
        await reply(t("commands.economy.buy.noMove"));
        return;
      }

      const spent = await bot.spendEconomyPoints(userId, item.price, identity);
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
        await bot.awardEconomyPoints(userId, item.price, identity);
        await reply(t("commands.economy.buy.failed", { error: err.message }));
        return;
      }
    }

    const spent = await bot.spendEconomyPoints(userId, item.price, identity);
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
