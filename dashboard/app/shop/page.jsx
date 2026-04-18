"use client";

import { useEffect, useState } from "react";
import Footer from "../../components/Footer";
import Navbar from "../../components/Navbar";
import { useI18n } from "../../lib/i18n";
import { publicFetch } from "../../lib/public-api";

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="copy-row">
      <code className="copy-text">{text}</code>
      <button
        className={`copy-btn-icon${copied ? " copied" : ""}`}
        onClick={handleCopy}
        title={copied ? "Copiado!" : "Copiar"}
      >
        <i className={copied ? "fa-solid fa-check" : "fa-solid fa-copy"} />
        <span className="copy-btn-label">{copied ? "Copiado!" : "Copiar"}</span>
      </button>
    </div>
  );
}

function CopyIconButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      className={`copy-icon-btn${copied ? " copied" : ""}`}
      onClick={handleCopy}
      title={text}
    >
      <i className={copied ? "fa-solid fa-check" : "fa-solid fa-copy"} />
      {copied ? "Copiado!" : "Copiar"}
    </button>
  );
}

function ShopItemCard({ item }) {
  return (
    <div className="shop-card">
      <div className="shop-card-header">
        <span className="shop-card-name">{item.name}</span>
        <span className="pill compact accent">
          <i className="fa-solid fa-coins" />
          {item.price}
        </span>
      </div>
      {item.description && (
        <p className="shop-card-desc">{item.description}</p>
      )}
      <CopyButton text={item.buyCommand} />
    </div>
  );
}

const VIP_COLORS = { bronze: "#cd7f32", silver: "#a8a9ad", gold: "#ffd700" };
const VIP_ICONS  = { bronze: "fa-shield", silver: "fa-shield-halved", gold: "fa-shield-heart" };
const DURATION_ICONS = {
  daily: "fa-sun", weekly: "fa-calendar-week",
  monthly: "fa-calendar", yearly: "fa-star",
};

function VipGroupCard({ level, items }) {
  const color = VIP_COLORS[level] ?? "var(--accent)";
  const icon  = VIP_ICONS[level]  ?? "fa-shield";

  return (
    <div className="vip-group-card" style={{ "--vip-color": color }}>
      <div className="vip-group-header">
        <i className={`fa-solid ${icon} vip-group-icon`} />
        <span className="vip-group-name">
          {level.charAt(0).toUpperCase() + level.slice(1)}
        </span>
      </div>
      <div className="vip-group-rows">
        {items.map((item) => {
          const dIcon = DURATION_ICONS[item.duration] ?? "fa-clock";
          return (
            <div className="vip-group-row" key={item.key}>
              <span className="vip-group-row-left">
                <i className={`fa-solid ${dIcon}`} />
                <span className="vip-group-duration">
                  {item.duration.charAt(0).toUpperCase() + item.duration.slice(1)}
                </span>
                {item.days ? (
                  <span className="vip-group-days">{item.days}d</span>
                ) : null}
              </span>
              <span className="vip-group-row-right">
                {item.discountPct > 0 && (
                  <span
                    className="pill compact"
                    style={{ background: "#10b98122", color: "#10b981" }}
                  >
                    -{item.discountPct}%
                  </span>
                )}
                <span className="vip-group-price">
                  <i className="fa-solid fa-coins" />
                  {item.price}
                </span>
                <CopyIconButton text={item.buyCommand} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ShopPage() {
  const { t, locale } = useI18n();
  const [data, setData]   = useState(null);
  const [config, setConfig] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    publicFetch(`/api/shop?locale=${encodeURIComponent(locale)}`)
      .then((res) => { if (active) setData(res); })
      .catch(() => {});
    return () => { active = false; };
  }, [locale]);

  useEffect(() => {
    let active = true;
    publicFetch("/api/session")
      .then((res) => { if (active) setConfig(res.config || {}); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const autowootUrl = config?.autowootUrl || "";
  const items    = data?.items    ?? [];
  const vipItems = data?.vipItems ?? [];
  const vipEnabled = data?.vipEnabled !== false;

  const lowerSearch = search.trim().toLowerCase();
  const filteredItems = lowerSearch
    ? items.filter(
        (i) =>
          i.name.toLowerCase().includes(lowerSearch) ||
          i.key.toLowerCase().includes(lowerSearch),
      )
    : items;
  const filteredVip = lowerSearch
    ? vipItems.filter((i) =>
        i.level.includes(lowerSearch) || i.duration.includes(lowerSearch),
      )
    : vipItems;

  // Group VIP items by level
  const vipByLevel = filteredVip.reduce((acc, item) => {
    if (!acc[item.level]) acc[item.level] = [];
    acc[item.level].push(item);
    return acc;
  }, {});

  return (
    <main className="page">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="topbar-icon">
            <i className="fa-solid fa-store" />
          </div>
          <div>
            <h1 className="topbar-title">{t("dashboard.shop.title")}</h1>
            <p className="topbar-subtitle">{t("dashboard.shop.subtitle")}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <Navbar autowootUrl={autowootUrl} />
        </div>
      </header>

      <div className="shop-search-bar">
        <i className="fa-solid fa-magnifying-glass" />
        <input
          className="shop-search-input"
          placeholder={t("dashboard.shop.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filteredItems.length > 0 && (
        <section className="panel fade-up">
          <div className="panel-header">
            <h2 className="panel-title">
              <i className="fa-solid fa-bag-shopping" />
              {t("dashboard.shop.itemsTitle")}
            </h2>
          </div>
          <div className="shop-grid">
            {filteredItems.map((item) => (
              <ShopItemCard key={item.key} item={item} />
            ))}
          </div>
        </section>
      )}

      {vipEnabled && Object.keys(vipByLevel).length > 0 && (
        <section className="panel fade-up">
          <div className="panel-header">
            <h2 className="panel-title">
              <i className="fa-solid fa-crown" />
              {t("dashboard.shop.vipTitle")}
            </h2>
            <p className="panel-subtitle">{t("dashboard.shop.vipSubtitle")}</p>
          </div>
          <div className="vip-groups-grid">
            {Object.entries(vipByLevel).map(([level, levelItems]) => (
              <VipGroupCard key={level} level={level} items={levelItems} />
            ))}
          </div>
        </section>
      )}

      {data && filteredItems.length === 0 && Object.keys(vipByLevel).length === 0 && (
        <div className="empty-state">
          <i className="fa-solid fa-box-open" />
          <p>{t("dashboard.shop.empty")}</p>
        </div>
      )}

      <Footer />
    </main>
  );
}
