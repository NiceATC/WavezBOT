"use client";

import { useEffect, useState } from "react";
import CommandsTable from "../../components/CommandsTable";
import Footer from "../../components/Footer";
import Navbar from "../../components/Navbar";
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
          <Navbar autowootUrl={autowootUrl} />
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
