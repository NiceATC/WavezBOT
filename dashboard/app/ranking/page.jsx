"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Footer from "../../components/Footer";
import { useI18n } from "../../lib/i18n";
import { formatNumber, formatPoints } from "../../lib/format";
import { publicFetch } from "../../lib/public-api";

function Section({ title, icon, children }) {
  return (
    <section className="panel fade-up">
      <div className="panel-header">
        <h2 className="panel-title">
          <i className={`fa-solid ${icon}`} />
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

export default function RankingPage() {
  const { t, locale } = useI18n();
  const [data, setData] = useState(null);
  const [config, setConfig] = useState(null);

  useEffect(() => {
    let active = true;
    publicFetch("/api/rankings")
      .then((res) => {
        if (active) setData(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    publicFetch("/api/session")
      .then((res) => {
        if (active) setConfig(res.config || {});
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const economy = data?.economy || [];
  const xp = data?.xp || [];
  const dj = data?.dj || [];
  const songs = data?.songs || [];
  const autowootUrl = config?.autowootUrl || "";

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
          <Link className="nav-link" href="/">
            <i className="fa-solid fa-house" />
            {t("dashboard.nav.home")}
          </Link>
          <Link className="nav-link" href="/commands">
            <i className="fa-solid fa-terminal" />
            {t("dashboard.nav.commands")}
          </Link>
          {autowootUrl ? (
            <a className="nav-link accent" href={autowootUrl} target="_blank" rel="noreferrer">
              <i className="fa-solid fa-bolt" />
              {t("dashboard.nav.autowoot")}
            </a>
          ) : null}
          <Link className="nav-link" href="/admin">
            <i className="fa-solid fa-shield-halved" />
            {t("dashboard.nav.admin")}
          </Link>
        </div>
      </header>

      <div className="panel-grid panel-grid-2">
        <Section title={t("dashboard.rankings.economy")} icon="fa-coins">
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("dashboard.rankings.user")}</th>
                  <th>{t("dashboard.rankings.points")}</th>
                </tr>
              </thead>
              <tbody>
                {economy.map((row, idx) => (
                  <tr key={row.user_id || idx}>
                    <td>{idx + 1}</td>
                    <td>{row.display_name || row.username || row.user_id}</td>
                    <td>{formatPoints(row.balance, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title={t("dashboard.rankings.xp")} icon="fa-star">
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("dashboard.rankings.user")}</th>
                  <th>{t("dashboard.rankings.level")}</th>
                </tr>
              </thead>
              <tbody>
                {xp.map((row, idx) => (
                  <tr key={row.user_id || idx}>
                    <td>{idx + 1}</td>
                    <td>{row.display_name || row.username || row.user_id}</td>
                    <td>{row.level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title={t("dashboard.rankings.djs")} icon="fa-headphones">
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("dashboard.rankings.user")}</th>
                  <th>{t("dashboard.rankings.plays")}</th>
                </tr>
              </thead>
              <tbody>
                {dj.map((row, idx) => (
                  <tr key={row.user_id || idx}>
                    <td>{idx + 1}</td>
                    <td>{row.display_name || row.username || row.user_id}</td>
                    <td>{formatNumber(row.plays, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title={t("dashboard.rankings.songs")} icon="fa-music">
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t("dashboard.rankings.track")}</th>
                  <th>{t("dashboard.rankings.plays")}</th>
                </tr>
              </thead>
              <tbody>
                {songs.map((row, idx) => (
                  <tr key={row.track_id || idx}>
                    <td>{idx + 1}</td>
                    <td>{row.artist ? `${row.artist} - ${row.title}` : row.title}</td>
                    <td>{formatNumber(row.plays, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      <Footer />
    </main>
  );
}
