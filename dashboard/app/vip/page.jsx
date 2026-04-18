"use client";

import { useEffect, useState } from "react";
import Footer from "../../components/Footer";
import Navbar from "../../components/Navbar";
import { useI18n } from "../../lib/i18n";
import { publicFetch } from "../../lib/public-api";

const VIP_COLORS = { bronze: "#cd7f32", silver: "#a8a9ad", gold: "#ffd700" };
const VIP_ICONS  = {
  bronze: "fa-shield",
  silver: "fa-shield-halved",
  gold:   "fa-shield-heart",
};

const BENEFIT_ICONS = {
  xpMultiplier:         "fa-star",
  economyMultiplier:    "fa-coins",
  dailyMultiplier:      "fa-calendar-check",
  workMultiplier:       "fa-briefcase",
  dcWindowMultiplier:   "fa-clock-rotate-left",
  afkLimitMultiplier:   "fa-stopwatch",
  shopDiscountPct:      "fa-tag",
  stealProtectionPct:   "fa-shield",
  insuranceDiscount:    "fa-umbrella",
};

function formatBenefitValue(key, value) {
  if (key === "shopDiscountPct") return `-${value}%`;
  if (key === "stealProtectionPct") return `${Math.round(value * 100)}%`;
  if (key === "insuranceDiscount")  return `-${Math.round(value * 100)}%`;
  return `×${value}`;
}

function BenefitRow({ icon, label, value }) {
  return (
    <div className="vip-benefit-row">
      <span className="vip-benefit-label">
        <i className={`fa-solid ${icon}`} />
        {label}
      </span>
      <span className="vip-benefit-value">{value}</span>
    </div>
  );
}

function VipLevelCard({ level, cfg, insuranceDiscount, t }) {
  const color = VIP_COLORS[level] ?? "var(--accent)";
  const icon  = VIP_ICONS[level]  ?? "fa-shield";

  const benefits = {
    ...cfg,
    insuranceDiscount,
  };

  return (
    <div className="vip-level-card" style={{ "--vip-color": color }}>
      <div className="vip-level-top-bar" />
      <div className="vip-level-header">
        <i className={`fa-solid ${icon} vip-level-icon`} />
        <h3 className="vip-level-name" style={{ color }}>
          {level.charAt(0).toUpperCase() + level.slice(1)}
        </h3>
        <span
          className="pill compact"
          style={{ background: color + "22", color }}
        >
          <i className="fa-solid fa-coins" />
          {cfg.monthlyPrice ?? "?"} / {t("dashboard.vip.perMonth")}
        </span>
      </div>

      <div className="vip-benefits">
        {Object.entries(benefits)
          .filter(([k]) => k !== "monthlyPrice" && BENEFIT_ICONS[k])
          .map(([key, val]) => (
            <BenefitRow
              key={key}
              icon={BENEFIT_ICONS[key]}
              label={t(`dashboard.vip.benefit.${key}`)}
              value={formatBenefitValue(key, val)}
            />
          ))}
      </div>
    </div>
  );
}

const DURATION_ICONS = {
  daily:   "fa-sun",
  weekly:  "fa-calendar-week",
  monthly: "fa-calendar",
  yearly:  "fa-star",
};

function DurationRow({ duration, cfg, t }) {
  const icon = DURATION_ICONS[duration] ?? "fa-clock";
  return (
    <div className="vip-duration-row">
      <span className="vip-duration-label">
        <i className={`fa-solid ${icon}`} />
        {duration.charAt(0).toUpperCase() + duration.slice(1)}
        <span className="vip-duration-days">({cfg.days ?? "?"} {t("dashboard.vip.days")})</span>
      </span>
      {cfg.discountPct > 0 ? (
        <span className="pill compact" style={{ background: "#10b98122", color: "#10b981" }}>
          -{cfg.discountPct}%
        </span>
      ) : (
        <span className="vip-duration-base">{t("dashboard.vip.noDiscount")}</span>
      )}
    </div>
  );
}

export default function VipPage() {
  const { t } = useI18n();
  const [data, setData]     = useState(null);
  const [config, setConfig] = useState(null);

  useEffect(() => {
    let active = true;
    publicFetch("/api/vip")
      .then((res) => { if (active) setData(res); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    publicFetch("/api/session")
      .then((res) => { if (active) setConfig(res.config || {}); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const autowootUrl  = config?.autowootUrl || "";
  const vipLevels    = data?.vipLevels    ?? {};
  const vipDurations = data?.vipDurations ?? {};
  const vipEnabled   = data?.vipEnabled !== false;
  const insDiscounts = data?.insuranceDiscounts ?? {};
  const insPrice     = data?.insurancePricePerDay ?? 5;
  const prefix       = data?.prefix ?? "!";

  return (
    <main className="page">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="topbar-icon">
            <i className="fa-solid fa-crown" />
          </div>
          <div>
            <h1 className="topbar-title">{t("dashboard.vip.title")}</h1>
            <p className="topbar-subtitle">{t("dashboard.vip.subtitle")}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <Navbar autowootUrl={autowootUrl} />
        </div>
      </header>

      {!vipEnabled && data && (
        <div className="empty-state">
          <i className="fa-solid fa-crown" />
          <p>{t("dashboard.vip.disabled")}</p>
        </div>
      )}

      {vipEnabled && (
        <>
          <section className="panel fade-up">
            <div className="panel-header">
              <h2 className="panel-title">
                <i className="fa-solid fa-crown" />
                {t("dashboard.vip.levelsTitle")}
              </h2>
              <p className="panel-subtitle">{t("dashboard.vip.levelsSubtitle")}</p>
            </div>
            <div className="vip-levels-grid">
              {Object.entries(vipLevels).map(([level, cfg]) => (
                <VipLevelCard
                  key={level}
                  level={level}
                  cfg={cfg}
                  insuranceDiscount={insDiscounts[level] ?? 0}
                  t={t}
                />
              ))}
            </div>
          </section>

          <section className="panel fade-up">
            <div className="panel-header">
              <h2 className="panel-title">
                <i className="fa-solid fa-calendar" />
                {t("dashboard.vip.durationsTitle")}
              </h2>
              <p className="panel-subtitle">{t("dashboard.vip.durationsSubtitle")}</p>
            </div>
            <div className="vip-durations-list">
              {Object.entries(vipDurations).map(([duration, cfg]) => (
                <DurationRow key={duration} duration={duration} cfg={cfg} t={t} />
              ))}
            </div>
          </section>

          <section className="panel fade-up">
            <div className="panel-header">
              <h2 className="panel-title">
                <i className="fa-solid fa-umbrella" />
                {t("dashboard.vip.insuranceTitle")}
              </h2>
            </div>
            <div className="vip-insurance-info">
              <p>{t("dashboard.vip.insuranceDesc", { price: insPrice })}</p>
              <div className="vip-benefits" style={{ marginTop: "1rem" }}>
                {Object.entries(insDiscounts).map(([level, disc]) => (
                  <BenefitRow
                    key={level}
                    icon={VIP_ICONS[level] ?? "fa-shield"}
                    label={level.charAt(0).toUpperCase() + level.slice(1)}
                    value={`-${Math.round(disc * 100)}%`}
                  />
                ))}
              </div>
              <p className="vip-insurance-cmd">
                <i className="fa-solid fa-terminal" />
                {t("dashboard.vip.insuranceBuyCmd", { prefix })}
              </p>
            </div>
          </section>

          <section className="panel fade-up">
            <div className="panel-header">
              <h2 className="panel-title">
                <i className="fa-solid fa-terminal" />
                {t("dashboard.vip.howToBuy")}
              </h2>
            </div>
            <div className="vip-howto">
              <p>{t("dashboard.vip.howToBuyDesc", { prefix })}</p>
              <code className="vip-cmd-example">{prefix}buy vip bronze monthly</code>
              <a className="nav-link accent" href="/shop" style={{ marginTop: "1rem", display: "inline-flex" }}>
                <i className="fa-solid fa-store" />
                {t("dashboard.vip.goToShop")}
              </a>
            </div>
          </section>
        </>
      )}

      <Footer />
    </main>
  );
}
