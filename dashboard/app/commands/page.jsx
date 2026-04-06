"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CommandsTable from "../../components/CommandsTable";
import Footer from "../../components/Footer";
import { useI18n } from "../../lib/i18n";
import { publicFetch } from "../../lib/public-api";

export default function CommandsPage() {
  const { t, locale } = useI18n();
  const [commands, setCommands] = useState([]);
  const [prefix, setPrefix] = useState("!");
  const [search, setSearch] = useState("");
  const [config, setConfig] = useState(null);

  useEffect(() => {
    let active = true;
    publicFetch(`/api/commands?locale=${encodeURIComponent(locale)}`)
      .then((data) => {
        if (!active) return;
        setCommands(data.commands || []);
        setPrefix(data.prefix || "!");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [locale]);

  useEffect(() => {
    let active = true;
    publicFetch("/api/session")
      .then((data) => {
        if (active) setConfig(data.config || {});
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const autowootUrl = config?.autowootUrl || "";

  return (
    <main className="page">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="topbar-icon">
            <i className="fa-solid fa-terminal" />
          </div>
          <div>
            <h1 className="topbar-title">{t("dashboard.commands.title")}</h1>
            <p className="topbar-subtitle">{t("dashboard.commands.subtitle")}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <Link className="nav-link" href="/">
            <i className="fa-solid fa-house" />
            {t("dashboard.nav.home")}
          </Link>
          <Link className="nav-link" href="/ranking">
            <i className="fa-solid fa-chart-line" />
            {t("dashboard.nav.ranking")}
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

      <section className="panel fade-up">
        <div className="panel-header">
          <h2 className="panel-title">
            <i className="fa-solid fa-terminal" />
            {t("dashboard.commands.title")}
          </h2>
        </div>
        <CommandsTable
          commands={commands}
          prefix={prefix}
          search={search}
          onSearch={setSearch}
          t={t}
        />
      </section>

      <Footer />
    </main>
  );
}
