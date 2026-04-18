"use client";

import { useEffect, useState } from "react";
import Footer from "../../components/Footer";
import Navbar from "../../components/Navbar";
import { useI18n } from "../../lib/i18n";
import { formatNumber, formatPoints } from "../../lib/format";
import { publicFetch } from "../../lib/public-api";

const MEDAL = ["🥇", "🥈", "🥉"];
const MEDAL_COLORS = ["#ffd700", "#a8a9ad", "#cd7f32"];
const MEDAL_BG     = ["rgba(255,215,0,0.12)", "rgba(168,169,173,0.12)", "rgba(205,127,50,0.12)"];

function Avatar({ name, size = 40, color }) {
  const letter = (name || "?")[0].toUpperCase();
  return (
    <div
      className="rank-avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: color ? color + "28" : "rgba(var(--accent-rgb),0.12)",
        color: color ?? "var(--accent)",
        borderColor: color ? color + "44" : "rgba(var(--accent-rgb),0.2)",
      }}
    >
      {letter}
    </div>
  );
}

function ProgressBar({ value, max, color }) {
  const pct = max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 3;
  return (
    <div className="rank-bar-track">
      <div
        className="rank-bar-fill"
        style={{ width: `${pct}%`, background: color ?? "var(--accent)" }}
      />
    </div>
  );
}

function PodiumCard({ rank, name, value, label, color }) {
  const idx = rank - 1;
  return (
    <div
      className="rank-podium-card"
      style={{ background: MEDAL_BG[idx] ?? "rgba(var(--accent-rgb),0.06)", borderColor: (MEDAL_COLORS[idx] ?? "var(--accent)") + "44" }}
    >
      <span className="rank-podium-medal">{MEDAL[idx] ?? rank}</span>
      <Avatar name={name} size={52} color={MEDAL_COLORS[idx]} />
      <span className="rank-podium-name">{name}</span>
      <span className="rank-podium-value" style={{ color: MEDAL_COLORS[idx] ?? "var(--accent)" }}>
        {value}
      </span>
      <span className="rank-podium-label">{label}</span>
    </div>
  );
}

function LeaderboardRow({ rank, name, value, label, max, accentColor, isSong }) {
  const isTop = rank <= 3;
  const medalColor = isTop ? MEDAL_COLORS[rank - 1] : null;
  return (
    <div className={`rank-row${isTop ? " rank-row-top" : ""}`}>
      <span className="rank-pos" style={medalColor ? { color: medalColor } : {}}>
        {isTop ? MEDAL[rank - 1] : <span className="rank-pos-num">{rank}</span>}
      </span>
      {!isSong && <Avatar name={name} size={34} color={medalColor ?? accentColor} />}
      {isSong && (
        <div className="rank-avatar rank-avatar-song" style={{ width: 34, height: 34, fontSize: 15, background: (accentColor ?? "var(--accent)") + "18", color: accentColor ?? "var(--accent)", borderColor: (accentColor ?? "var(--accent)") + "33" }}>
          <i className="fa-solid fa-music" />
        </div>
      )}
      <div className="rank-row-info">
        <span className="rank-row-name">{name}</span>
        <ProgressBar value={value} max={max} color={medalColor ?? accentColor} />
      </div>
      <span className="rank-row-value" style={{ color: medalColor ?? accentColor ?? "var(--accent)" }}>
        {label}
      </span>
    </div>
  );
}

function CategoryPanel({ rows, valueKey, labelFn, podiumLabel, isSong, accentColor, t, emptyKey }) {
  if (!rows.length) {
    return (
      <div className="empty-state" style={{ padding: "3rem 0" }}>
        <i className="fa-solid fa-chart-bar" />
        <p>{t(emptyKey, "Sem dados ainda.")}</p>
      </div>
    );
  }

  const maxValue = rows[0]?.[valueKey] ?? 1;
  const podium = rows.slice(0, 3);
  const rest   = rows.slice(3);

  const getName = (row) =>
    isSong
      ? (row.artist ? `${row.artist} — ${row.title}` : row.title)
      : (row.displayName || row.username || row.userId || "?");

  return (
    <div className="rank-panel-body">
      <div className="rank-podium">
        {podium.map((row, i) => (
          <PodiumCard
            key={row.userId ?? row.track_id ?? i}
            rank={i + 1}
            name={getName(row)}
            value={labelFn(row)}
            label={podiumLabel}
            color={MEDAL_COLORS[i]}
          />
        ))}
      </div>

      {rest.length > 0 && (
        <div className="rank-list">
          {rest.map((row, i) => (
            <LeaderboardRow
              key={row.userId ?? row.track_id ?? i}
              rank={i + 4}
              name={getName(row)}
              value={row[valueKey] ?? 0}
              label={labelFn(row)}
              max={maxValue}
              accentColor={accentColor}
              isSong={isSong}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const CATEGORIES = ["economy", "xp", "chat", "casinoWins", "casinoLosses", "djs", "songs"];
const CATEGORY_META = {
  economy: { icon: "fa-coins",      accentVar: "var(--accent-3)" },
  xp:      { icon: "fa-star",       accentVar: "var(--accent)"   },
  chat:    { icon: "fa-comment",    accentVar: "#22c55e"         },
  casinoWins:   { icon: "fa-trophy", accentVar: "#10b981"       },
  casinoLosses: { icon: "fa-face-frown", accentVar: "#ef4444"   },
  djs:     { icon: "fa-headphones", accentVar: "var(--accent-2)" },
  songs:   { icon: "fa-music",      accentVar: "var(--accent-4)" },
};

export default function RankingPage() {
  const { t, locale } = useI18n();
  const [data, setData]     = useState(null);
  const [config, setConfig] = useState(null);
  const [tab, setTab]       = useState("economy");

  useEffect(() => {
    let active = true;
    publicFetch("/api/rankings").then((res) => { if (active) setData(res); }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    publicFetch("/api/session").then((res) => { if (active) setConfig(res.config || {}); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const economy     = data?.economy || [];
  const xp          = data?.xp      || [];
  const chat        = data?.chat    || [];
  const casinoWins  = data?.casinoWins || [];
  const casinoLosses = data?.casinoLosses || [];
  const dj          = data?.dj      || [];
  const songs       = data?.songs   || [];
  const autowootUrl = config?.autowootUrl || "";

  const categoryCounts = {
    economy: economy.length,
    xp: xp.length,
    chat: chat.length,
    casinoWins: casinoWins.length,
    casinoLosses: casinoLosses.length,
    djs: dj.length,
    songs: songs.length,
  };

  const panels = {
    economy: (
      <CategoryPanel
        rows={economy}
        valueKey="balance"
        labelFn={(r) => formatPoints(r.balance, locale)}
        podiumLabel={t("dashboard.rankings.points", "pts")}
        accentColor="var(--accent-3)"
        t={t}
        emptyKey="dashboard.rankings.empty"
      />
    ),
    xp: (
      <CategoryPanel
        rows={xp}
        valueKey="level"
        labelFn={(r) => `Lv ${r.level}`}
        podiumLabel={t("dashboard.rankings.level", "nível")}
        accentColor="var(--accent)"
        t={t}
        emptyKey="dashboard.rankings.empty"
      />
    ),
    chat: (
      <CategoryPanel
        rows={chat}
        valueKey="chatCount"
        labelFn={(r) => formatNumber(r.chatCount, locale)}
        podiumLabel={t("dashboard.rankings.messages", "mensagens")}
        accentColor="#22c55e"
        t={t}
        emptyKey="dashboard.rankings.empty"
      />
    ),
    casinoWins: (
      <CategoryPanel
        rows={casinoWins}
        valueKey="casinoWins"
        labelFn={(r) => formatNumber(r.casinoWins, locale)}
        podiumLabel={t("dashboard.rankings.wins", "vitórias")}
        accentColor="#10b981"
        t={t}
        emptyKey="dashboard.rankings.empty"
      />
    ),
    casinoLosses: (
      <CategoryPanel
        rows={casinoLosses}
        valueKey="casinoLosses"
        labelFn={(r) => formatNumber(r.casinoLosses, locale)}
        podiumLabel={t("dashboard.rankings.losses", "derrotas")}
        accentColor="#ef4444"
        t={t}
        emptyKey="dashboard.rankings.empty"
      />
    ),
    djs: (
      <CategoryPanel
        rows={dj}
        valueKey="djPlays"
        labelFn={(r) => formatNumber(r.djPlays, locale)}
        podiumLabel={t("dashboard.rankings.plays", "plays")}
        accentColor="var(--accent-2)"
        t={t}
        emptyKey="dashboard.rankings.empty"
      />
    ),
    songs: (
      <CategoryPanel
        rows={songs}
        valueKey="plays"
        labelFn={(r) => formatNumber(r.plays, locale)}
        podiumLabel={t("dashboard.rankings.plays", "plays")}
        isSong
        accentColor="var(--accent-4)"
        t={t}
        emptyKey="dashboard.rankings.empty"
      />
    ),
  };

  return (
    <main className="page">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="topbar-icon">
            <i className="fa-solid fa-trophy" />
          </div>
          <div>
            <h1 className="topbar-title">{t("dashboard.rankings.title")}</h1>
            <p className="topbar-subtitle">{t("dashboard.rankings.subtitle")}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <Navbar autowootUrl={autowootUrl} />
        </div>
      </header>

      <section className="panel fade-up">
        <div className="rank-tabs">
          {CATEGORIES.map((cat) => {
            const meta = CATEGORY_META[cat];
            const count = categoryCounts[cat];
            return (
              <button
                key={cat}
                className={`rank-tab${tab === cat ? " active" : ""}`}
                style={tab === cat ? { "--tab-accent": meta.accentVar } : {}}
                onClick={() => setTab(cat)}
              >
                <i className={`fa-solid ${meta.icon}`} />
                {t(`dashboard.rankings.${cat}`, cat)}
                {count > 0 && <span className="rank-tab-count">{count}</span>}
              </button>
            );
          })}
        </div>

        <div className="rank-panel-wrap">
          {data === null ? (
            <div className="rank-skeleton">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="rank-row">
                  <span className="skeleton skeleton-pill" style={{ width: 28, height: 28 }} />
                  <span className="skeleton" style={{ width: 34, height: 34, borderRadius: "50%" }} />
                  <div className="rank-row-info">
                    <span className="skeleton skeleton-pill" style={{ width: `${60 + i * 8}%`, height: 14 }} />
                    <span className="skeleton skeleton-pill" style={{ width: `${80 - i * 10}%`, height: 6, marginTop: 6 }} />
                  </div>
                  <span className="skeleton skeleton-pill" style={{ width: 56, height: 18 }} />
                </div>
              ))}
            </div>
          ) : (
            panels[tab]
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
