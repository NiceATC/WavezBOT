"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Footer from "../components/Footer";
import StatsGrid from "../components/StatsGrid";
import { useI18n } from "../lib/i18n";
import { useDashboardSocket } from "../lib/socket";
import { publicFetch } from "../lib/public-api";

export default function Page() {
  const { t, ready } = useI18n();
  const [stats, setStats] = useState(null);
  useDashboardSocket(null, (message) => {
    if (message?.type === "stats") {
      setStats(message.payload);
    }
  });

  useEffect(() => {
    let active = true;
    publicFetch("/api/session")
      .then((data) => {
        if (active) setStats(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const isLoading = !ready || !stats;
  const state = stats?.state || {};
  const config = stats?.config || {};
  const roomUrl = config.roomUrl || "";
  const empty = ready ? t("dashboard.stats.empty") : "";
  const roomLabel = state.roomName || config.room || empty;
  const autowootUrl = config.autowootUrl || "";
  const versionLabel = stats?.version ? `v${stats.version}` : "v-";
  const statusLabel = state.paused
    ? t("dashboard.stats.paused")
    : t("dashboard.stats.running");

  return (
    <main className="page">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="topbar-icon">
            <i className="fa-solid fa-sparkles" />
          </div>
          <div>
            <div className="topbar-title-row">
              <h1 className="topbar-title">
                {ready ? t("dashboard.title") : (
                  <span className="skeleton skeleton-title" />
                )}
              </h1>
              <div className="topbar-badges">
                {isLoading ? (
                  <span className="pill compact skeleton skeleton-pill" />
                ) : (
                  <span className="pill compact">
                    <i className="fa-solid fa-signal" />
                    {statusLabel}
                  </span>
                )}
                {isLoading ? (
                  <span className="pill compact skeleton skeleton-pill" />
                ) : (
                  <span className="pill compact">
                    <i className="fa-solid fa-code-branch" />
                    {versionLabel}
                  </span>
                )}
              </div>
            </div>
            <p className="topbar-subtitle">
              {ready ? t("dashboard.subtitle") : (
                <span className="skeleton skeleton-text" />
              )}
            </p>
          </div>
        </div>
        <div className="topbar-actions">
          {ready ? (
            <>
              <Link className="nav-link" href="/commands">
                <i className="fa-solid fa-terminal" />
                {t("dashboard.nav.commands")}
              </Link>
              <Link className="nav-link" href="/ranking">
                <i className="fa-solid fa-chart-line" />
                {t("dashboard.nav.ranking")}
              </Link>
              {autowootUrl ? (
                <a
                  className="nav-link accent"
                  href={autowootUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <i className="fa-solid fa-bolt" />
                  {t("dashboard.nav.autowoot")}
                </a>
              ) : null}
              <Link className="nav-link" href="/admin">
                <i className="fa-solid fa-shield-halved" />
                {t("dashboard.nav.admin")}
              </Link>
            </>
          ) : (
            <>
              <span className="nav-link skeleton skeleton-pill" />
              <span className="nav-link skeleton skeleton-pill" />
              <span className="nav-link skeleton skeleton-pill" />
            </>
          )}
        </div>
      </header>

      <section className="hero small">
        <div className="hero-card fade-up">
          <div className="room-header">
            <div>
              <span className="badge">
                {ready ? t("dashboard.room.title") : (
                  <span className="skeleton skeleton-badge" />
                )}
              </span>
              <h2 className="hero-title">
                {isLoading ? (
                  <span className="skeleton skeleton-hero" />
                ) : (
                  roomLabel
                )}
              </h2>
            </div>
            {isLoading ? (
              <span className="button secondary small room-action skeleton skeleton-pill" />
            ) : roomUrl ? (
              <a
                className="button secondary small room-action"
                href={roomUrl}
                target="_blank"
                rel="noreferrer"
              >
                <i className="fa-solid fa-arrow-up-right-from-square" />
                {t("dashboard.room.open")}
              </a>
            ) : (
              <span className="pill compact">{t("dashboard.room.missing")}</span>
            )}
          </div>
          <p className="hero-subtitle">
            {ready ? t("dashboard.subtitle") : (
              <span className="skeleton skeleton-text" />
            )}
          </p>
        </div>

      </section>

      <section className="panel fade-up">
        <div className="panel-header">
          <h2 className="panel-title">
            <i className="fa-solid fa-chart-column" />
            {t("dashboard.stats.title")}
          </h2>
        </div>
        <StatsGrid stats={stats} t={t} loading={isLoading} />
      </section>

      <Footer />
    </main>
  );
}
