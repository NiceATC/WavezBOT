"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as Tabs from "@radix-ui/react-tabs";
import DataGrid from "react-data-grid";
import AuthGate from "../../components/AuthGate";
import CodeEditor from "../../components/CodeEditor";
import Footer from "../../components/Footer";
import StatsGrid from "../../components/StatsGrid";
import { formatBytes, formatRate } from "../../lib/format";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { useDashboardSocket } from "../../lib/socket";
import { getDefaultTheme, useTheme } from "../../lib/theme";

const MAX_LOGS = 400;

export default function AdminPage() {
  const { token, apiFetch, logout } = useAuth();
  const { t, locale, locales } = useI18n();
  const { setTheme } = useTheme();
  const [stats, setStats] = useState(null);
  const [system, setSystem] = useState(null);
  const [logs, setLogs] = useState([]);
  const consoleRef = useRef(null);
  const [actionStatus, setActionStatus] = useState("");
  const [i18nText, setI18nText] = useState("");
  const [i18nLocale, setI18nLocale] = useState(locale);
  const [i18nMessage, setI18nMessage] = useState("");
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [tableColumns, setTableColumns] = useState([]);
  const [tableRows, setTableRows] = useState([]);
  const [tableSearch, setTableSearch] = useState("");
  const [sortColumns, setSortColumns] = useState([]);
  const [allowSql, setAllowSql] = useState(false);
  const [sql, setSql] = useState("");
  const [sqlResult, setSqlResult] = useState("");
  const [showSql, setShowSql] = useState(false);
  const [configKeys, setConfigKeys] = useState([]);
  const [configText, setConfigText] = useState("");
  const [configMessage, setConfigMessage] = useState("");
  const [configRestartKeys, setConfigRestartKeys] = useState([]);
  const [themeDraft, setThemeDraft] = useState(() => getDefaultTheme());
  const [themeMessage, setThemeMessage] = useState("");
  const [editorType, setEditorType] = useState("commands");
  const [editorFiles, setEditorFiles] = useState([]);
  const [editorFile, setEditorFile] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [editorMessage, setEditorMessage] = useState("");
  const [newFilePath, setNewFilePath] = useState("");
  const [fileEditEnabled, setFileEditEnabled] = useState(true);
  const localeOptions = locales.length
    ? locales
    : [i18nLocale].filter(Boolean);
  const visibleConfigKeys = useMemo(
    () => configKeys.filter((key) => key !== "dashboardTheme"),
    [configKeys],
  );
  const themeFields = useMemo(
    () => [
      { key: "bg", label: t("dashboard.admin.theme.bg") },
      { key: "surface", label: t("dashboard.admin.theme.surface") },
      { key: "surfaceStrong", label: t("dashboard.admin.theme.surfaceStrong") },
      { key: "ink", label: t("dashboard.admin.theme.ink") },
      { key: "muted", label: t("dashboard.admin.theme.muted") },
      { key: "accent", label: t("dashboard.admin.theme.accent") },
      { key: "accent2", label: t("dashboard.admin.theme.accent2") },
      { key: "accent3", label: t("dashboard.admin.theme.accent3") },
      { key: "accent4", label: t("dashboard.admin.theme.accent4") },
      { key: "stroke", label: t("dashboard.admin.theme.stroke") },
    ],
    [t],
  );
  const gridColumns = useMemo(
    () =>
      tableColumns.map((col) => ({
        key: col,
        name: col,
        resizable: true,
        sortable: true,
      })),
    [tableColumns],
  );
  const gridRows = useMemo(() => {
    const term = String(tableSearch || "").trim().toLowerCase();
    const filtered = term
      ? tableRows.filter((row) =>
          tableColumns.some((col) =>
            String(row?.[col] ?? "")
              .toLowerCase()
              .includes(term),
          ),
        )
      : tableRows;
    if (!sortColumns.length) return filtered;
    const [{ columnKey, direction }] = sortColumns;
    const sorted = [...filtered].sort((a, b) => {
      const aVal = a?.[columnKey];
      const bVal = b?.[columnKey];
      if (typeof aVal === "number" && typeof bVal === "number") {
        return direction === "ASC" ? aVal - bVal : bVal - aVal;
      }
      const aText = String(aVal ?? "");
      const bText = String(bVal ?? "");
      return direction === "ASC"
        ? aText.localeCompare(bText)
        : bText.localeCompare(aText);
    });
    return sorted;
  }, [tableRows, tableColumns, tableSearch, sortColumns]);

  useDashboardSocket(token, (message) => {
    if (message?.type === "stats") {
      setStats(message.payload);
    }
    if (message?.type === "logs") {
      setLogs(message.payload || []);
    }
    if (message?.type === "log") {
      setLogs((prev) => {
        const next = [...prev, message.payload];
        return next.slice(-MAX_LOGS);
      });
    }
  });

  useEffect(() => {
    setI18nLocale(locale);
  }, [locale]);

  useEffect(() => {
    const node = consoleRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (token) loadTables();
  }, [token]);

  useEffect(() => {
    setSortColumns([]);
  }, [tableColumns]);

  useEffect(() => {
    if (!token) return undefined;
    let active = true;

    const loadSystem = async () => {
      try {
        const data = await apiFetch("/api/admin/system");
        if (active) setSystem(data.system || null);
      } catch {
        // ignore
      }
    };

    loadSystem();
    const interval = setInterval(loadSystem, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [token]);

  useEffect(() => {
    if (token && i18nLocale) loadLocale();
  }, [token, i18nLocale]);

  useEffect(() => {
    if (token) loadConfig();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (editorType === "commands" || editorType === "events") {
      loadEditorFiles(editorType);
    }
  }, [token, editorType]);

  useEffect(() => {
    if (editorType === "commands" || editorType === "events") {
      setEditorFile("");
      setEditorContent("");
    }
  }, [editorType]);

  const runAction = async (path) => {
    if (!token) return;
    setActionStatus(path);
    try {
      await apiFetch(path, { method: "POST" });
    } catch {
      // ignore
    } finally {
      setActionStatus("");
    }
  };

  const loadLocale = async () => {
    if (!i18nLocale) return;
    setI18nMessage("");
    try {
      const data = await apiFetch(
        `/api/locales/${encodeURIComponent(i18nLocale)}`,
      );
      setI18nText(JSON.stringify(data.data || {}, null, 2));
    } catch {
      setI18nMessage(t("dashboard.errors.network"));
    }
  };

  const saveLocale = async () => {
    if (!i18nLocale) return;
    setI18nMessage("");
    try {
      const parsed = JSON.parse(i18nText || "{}");
      await apiFetch(`/api/locales/${encodeURIComponent(i18nLocale)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      setI18nMessage(t("dashboard.admin.i18n.saved"));
    } catch (err) {
      setI18nMessage(t("dashboard.admin.i18n.invalidJson"));
    }
  };

  const loadTables = async () => {
    try {
      const data = await apiFetch("/api/db/tables");
      setTables(data.tables || []);
      setAllowSql(Boolean(data.allowSql));
    } catch {
      // ignore
    }
  };

  const loadTableRows = async () => {
    if (!selectedTable) return;
    try {
      const data = await apiFetch(
        `/api/db/table?name=${encodeURIComponent(selectedTable)}`,
      );
      const columns = Array.isArray(data.columns) ? data.columns : [];
      const rows = Array.isArray(data.rows) ? data.rows : [];
      setTableColumns(columns);
      setTableRows(rows.map((row, idx) => ({ ...row, __rowId: idx })));
    } catch {
      // ignore
    }
  };

  const runSql = async () => {
    if (!sql.trim()) return;
    setSqlResult("");
    try {
      const data = await apiFetch("/api/db/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      setSqlResult(JSON.stringify(data.result || {}, null, 2));
    } catch (err) {
      setSqlResult(err?.message || "error");
    }
  };

  const loadConfig = async () => {
    setConfigMessage("");
    try {
      const data = await apiFetch("/api/config");
      const keys = Array.isArray(data.editableKeys) ? data.editableKeys : [];
      const values = data.values || {};
      const visibleKeys = keys.filter((key) => key !== "dashboardTheme");
      const nextConfig = {};
      visibleKeys.forEach((key) => {
        const value = values[key];
        nextConfig[key] = value === undefined ? null : value;
      });
      setConfigKeys(keys);
      setConfigText(JSON.stringify(nextConfig, null, 2));
      setConfigRestartKeys(data.restartKeys || []);
      const rawTheme = values.dashboardTheme;
      const nextTheme = {
        ...getDefaultTheme(),
        ...(rawTheme && typeof rawTheme === "object" ? rawTheme : {}),
      };
      setThemeDraft(nextTheme);
      setTheme(nextTheme);
    } catch {
      setConfigMessage(t("dashboard.errors.network"));
    }
  };

  const saveConfig = async () => {
    setConfigMessage("");
    try {
      let parsed;
      try {
        parsed = JSON.parse(configText || "{}");
      } catch {
        setConfigMessage(t("dashboard.config.invalidJson"));
        return;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setConfigMessage(t("dashboard.config.invalidJson"));
        return;
      }
      const updates = {};
      visibleConfigKeys.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(parsed, key)) {
          updates[key] = parsed[key];
        }
      });
      const data = await apiFetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      setConfigRestartKeys(data.restartKeys || []);
      if (data?.restartKeys?.length) {
        setConfigMessage(
          `${t("dashboard.config.saved")} ${t("dashboard.config.restart")}`,
        );
      } else {
        setConfigMessage(t("dashboard.config.saved"));
      }
    } catch {
      setConfigMessage(t("dashboard.errors.network"));
    }
  };

  const isHexColor = (value) =>
    /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || ""));

  const updateThemeValue = (key, value) => {
    setThemeMessage("");
    setThemeDraft((prev) => {
      const next = { ...prev, [key]: value };
      setTheme(next);
      return next;
    });
  };

  const resetTheme = () => {
    const next = getDefaultTheme();
    setThemeDraft(next);
    setTheme(next);
    setThemeMessage("");
  };

  const saveTheme = async () => {
    setThemeMessage("");
    try {
      await apiFetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: {
            dashboardTheme: JSON.stringify(themeDraft || {}),
          },
        }),
      });
      setThemeMessage(t("dashboard.admin.theme.saved"));
    } catch {
      setThemeMessage(t("dashboard.errors.network"));
    }
  };

  const loadEditorFiles = async (type) => {
    setEditorMessage("");
    try {
      const data = await apiFetch(`/api/files?type=${type}`);
      setEditorFiles(data.files || []);
      setFileEditEnabled(true);
    } catch (err) {
      if (err?.code === "file_edit_disabled") {
        setFileEditEnabled(false);
        setEditorMessage(t("dashboard.editor.disabled"));
      } else {
        setEditorMessage(t("dashboard.errors.network"));
      }
    }
  };

  const loadEditorFile = async (fileOverride) => {
    const file = fileOverride || editorFile;
    if (!file) return;
    setEditorMessage("");
    try {
      const data = await apiFetch(
        `/api/files/content?type=${editorType}&file=${encodeURIComponent(file)}`,
      );
      setEditorContent(data.content || "");
    } catch (err) {
      if (err?.code === "file_edit_disabled") {
        setFileEditEnabled(false);
        setEditorMessage(t("dashboard.editor.disabled"));
      } else {
        setEditorMessage(t("dashboard.errors.network"));
      }
    }
  };

  const buildTemplate = (type, filePath) => {
    const name =
      String(filePath || "")
        .replace(/\.js$/i, "")
        .split("/")
        .pop() || "new-command";

    if (type === "events") {
      return `import { Events } from "../../lib/wavez-events.js";\n\nexport default {\n  name: "${name}",\n  descriptionKey: "events.${name}.description",\n  event: Events.ROOM_CHAT_MESSAGE,\n\n  async handle(ctx, data) {\n    // TODO: implement event handler\n  },\n};\n`;
    }

    return `export default {\n  name: "${name}",\n  descriptionKey: "commands.${name}.description",\n  usageKey: "commands.${name}.usage",\n  cooldown: 3000,\n\n  async execute(ctx) {\n    await ctx.reply("ok");\n  },\n};\n`;
  };

  const saveEditorFile = async () => {
    if (!editorFile) return;
    setEditorMessage("");
    try {
      await apiFetch(
        `/api/files/content?type=${editorType}&file=${encodeURIComponent(
          editorFile,
        )}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: editorContent }),
        },
      );
      setEditorMessage(t("dashboard.editor.saved"));
      loadEditorFiles(editorType);
    } catch (err) {
      if (err?.code === "file_edit_disabled") {
        setFileEditEnabled(false);
        setEditorMessage(t("dashboard.editor.disabled"));
      } else {
        setEditorMessage(t("dashboard.errors.network"));
      }
    }
  };

  const createEditorFile = async () => {
    if (!newFilePath) return;
    setEditorMessage("");
    const content = editorContent || buildTemplate(editorType, newFilePath);
    try {
      await apiFetch(
        `/api/files/content?type=${editorType}&file=${encodeURIComponent(
          newFilePath,
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      setEditorFile(newFilePath);
      setEditorContent(content);
      setEditorMessage(t("dashboard.editor.created"));
      setNewFilePath("");
      loadEditorFiles(editorType);
    } catch (err) {
      if (err?.code === "file_edit_disabled") {
        setFileEditEnabled(false);
        setEditorMessage(t("dashboard.editor.disabled"));
      } else {
        setEditorMessage(t("dashboard.errors.network"));
      }
    }
  };

  const autowootUrl = stats?.config?.autowootUrl || "";
  const statusLabel = stats?.state?.paused
    ? t("dashboard.stats.paused")
    : t("dashboard.stats.running");
  const statusIcon = stats?.state?.paused
    ? "fa-circle-pause"
    : "fa-circle-play";
  const empty = t("dashboard.stats.empty");
  const systemStats = system || {};
  const cpuLabel =
    systemStats.cpu?.loadPct != null
      ? `${systemStats.cpu.loadPct}%`
      : empty;
  const memLabel =
    systemStats.memory?.used != null && systemStats.memory?.total != null
      ? `${formatBytes(systemStats.memory.used)} / ${formatBytes(
          systemStats.memory.total,
        )} (${systemStats.memory.usedPct}%)`
      : empty;
  const diskLabel =
    systemStats.disk?.used != null && systemStats.disk?.total != null
      ? `${formatBytes(systemStats.disk.used)} / ${formatBytes(
          systemStats.disk.total,
        )} (${systemStats.disk.usedPct}%)`
      : empty;
  const netLabel =
    systemStats.network?.rxSec != null && systemStats.network?.txSec != null
      ? `↓ ${formatRate(systemStats.network.rxSec)}  ↑ ${formatRate(
          systemStats.network.txSec,
        )}`
      : empty;
  const pingLabel =
    systemStats.pingMs != null ? `${systemStats.pingMs} ms` : empty;

  const systemCards = [
    {
      key: "cpu",
      label: t("dashboard.admin.console.cpu"),
      value: cpuLabel,
      icon: "fa-microchip",
    },
    {
      key: "memory",
      label: t("dashboard.admin.console.memory"),
      value: memLabel,
      icon: "fa-memory",
    },
    {
      key: "disk",
      label: t("dashboard.admin.console.disk"),
      value: diskLabel,
      icon: "fa-hard-drive",
    },
    {
      key: "network",
      label: t("dashboard.admin.console.network"),
      value: netLabel,
      icon: "fa-network-wired",
    },
    {
      key: "ping",
      label: t("dashboard.admin.console.ping"),
      value: pingLabel,
      icon: "fa-satellite-dish",
    },
  ];

  return (
    <AuthGate>
      <main className="page page--wide">
        <header className="topbar">
          <div className="topbar-brand">
            <div className="topbar-icon">
              <i className="fa-solid fa-shield-halved" />
            </div>
            <div>
              <h1 className="topbar-title">{t("dashboard.admin.title")}</h1>
              <p className="topbar-subtitle">{t("dashboard.admin.subtitle")}</p>
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
            <button className="button" onClick={logout}>
              <i className="fa-solid fa-right-from-bracket" />
              {t("dashboard.auth.logout")}
            </button>
          </div>
        </header>

        <Tabs.Root defaultValue="ops" className="tabs-root">
          <Tabs.List className="tabs-list">
            <Tabs.Trigger value="ops" className="tabs-trigger">
              <i className="fa-solid fa-gauge-high" />
              {t("dashboard.admin.overview")}
            </Tabs.Trigger>
            <Tabs.Trigger value="editor" className="tabs-trigger">
              <i className="fa-solid fa-file-code" />
              {t("dashboard.editor.title")}
            </Tabs.Trigger>
            <Tabs.Trigger value="db" className="tabs-trigger">
              <i className="fa-solid fa-database" />
              {t("dashboard.admin.db.title")}
            </Tabs.Trigger>
            <Tabs.Trigger value="console" className="tabs-trigger">
              <i className="fa-solid fa-terminal" />
              {t("dashboard.admin.console.title")}
            </Tabs.Trigger>
            <Tabs.Trigger value="theme" className="tabs-trigger">
              <i className="fa-solid fa-palette" />
              {t("dashboard.admin.theme.title")}
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="ops" className="tabs-content">
            <div className="admin-grid">
              <section className="panel fade-up">
                <div className="panel-header">
                  <h2 className="panel-title">
                    <i className="fa-solid fa-chart-column" />
                    {t("dashboard.stats.title")}
                  </h2>
                  <span className="pill accent">
                    <i className={`fa-solid ${statusIcon}`} />
                    {statusLabel}
                  </span>
                </div>
                <StatsGrid stats={stats} t={t} />
              </section>
            </div>
          </Tabs.Content>

          <Tabs.Content value="theme" className="tabs-content">
            <section className="panel fade-up">
              <div className="panel-header">
                <h2 className="panel-title">
                  <i className="fa-solid fa-palette" />
                  {t("dashboard.admin.theme.title")}
                </h2>
                <span className="badge">{themeFields.length}</span>
              </div>
              <p className="muted">{t("dashboard.admin.theme.subtitle")}</p>
              <div className="theme-grid">
                {themeFields.map((field) => {
                  const value = themeDraft?.[field.key] ?? "";
                  return (
                    <div key={field.key} className="theme-row">
                      <div
                        className="theme-swatch"
                        style={{ background: value || "transparent" }}
                      />
                      <div className="theme-info">
                        <div className="theme-label">{field.label}</div>
                        <div className="theme-key">{field.key}</div>
                      </div>
                      <div className="theme-inputs">
                        {isHexColor(value) ? (
                          <input
                            className="color-input"
                            type="color"
                            value={value}
                            onChange={(event) =>
                              updateThemeValue(field.key, event.target.value)
                            }
                            aria-label={field.label}
                          />
                        ) : null}
                        <input
                          className="input"
                          value={value}
                          onChange={(event) =>
                            updateThemeValue(field.key, event.target.value)
                          }
                          placeholder={t(
                            "dashboard.admin.theme.valuePlaceholder",
                          )}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {themeMessage ? <p className="muted">{themeMessage}</p> : null}
              <div className="hero-actions">
                <button className="button secondary" onClick={resetTheme}>
                  <i className="fa-solid fa-rotate-left" />
                  {t("dashboard.admin.theme.reset")}
                </button>
                <button className="button" onClick={saveTheme}>
                  <i className="fa-solid fa-floppy-disk" />
                  {t("dashboard.admin.theme.save")}
                </button>
              </div>
            </section>
          </Tabs.Content>

          <Tabs.Content value="editor" className="tabs-content">
            <section className="panel fade-up">
              <div className="panel-header">
                <h2 className="panel-title">
                  <i className="fa-solid fa-file-code" />
                  {t("dashboard.editor.title")}
                </h2>
                <div className="panel-actions">
                  <div className="segmented">
                    <button
                      className={`segmented-button ${
                        editorType === "commands" ? "active" : ""
                      }`}
                      onClick={() => setEditorType("commands")}
                    >
                      <i className="fa-solid fa-terminal" />
                      {t("dashboard.editor.commands")}
                    </button>
                    <button
                      className={`segmented-button ${
                        editorType === "events" ? "active" : ""
                      }`}
                      onClick={() => setEditorType("events")}
                    >
                      <i className="fa-solid fa-bolt" />
                      {t("dashboard.editor.events")}
                    </button>
                    <button
                      className={`segmented-button ${
                        editorType === "config" ? "active" : ""
                      }`}
                      onClick={() => setEditorType("config")}
                    >
                      <i className="fa-solid fa-sliders" />
                      {t("dashboard.config.title")}
                    </button>
                    <button
                      className={`segmented-button ${
                        editorType === "i18n" ? "active" : ""
                      }`}
                      onClick={() => setEditorType("i18n")}
                    >
                      <i className="fa-solid fa-language" />
                      {t("dashboard.admin.i18n.title")}
                    </button>
                  </div>
                </div>
              </div>

              {editorType === "commands" || editorType === "events" ? (
                !fileEditEnabled ? (
                  <p className="muted">{t("dashboard.editor.disabled")}</p>
                ) : (
                  <div className="editor-shell">
                    <div className="editor-sidebar">
                      <div>
                        <div className="panel-header" style={{ marginBottom: "8px" }}>
                          <h3 className="panel-title">
                            <i className="fa-solid fa-folder" />
                            {t("dashboard.editor.files")}
                          </h3>
                          <span className="badge">{editorFiles.length}</span>
                        </div>
                        <div className="file-list">
                          {editorFiles.length === 0 ? (
                            <div className="muted">{t("dashboard.editor.files")}</div>
                          ) : (
                            editorFiles.map((file) => (
                              <button
                                key={file}
                                className={`file-item ${
                                  editorFile === file ? "active" : ""
                                }`}
                                onClick={() => {
                                  setEditorFile(file);
                                  loadEditorFile(file);
                                }}
                              >
                                <i className="fa-solid fa-file-code" />
                                {file}
                              </button>
                            ))
                          )}
                        </div>
                      </div>

                      <div>
                        <label>{t("dashboard.editor.path")}</label>
                        <input
                          className="input"
                          value={newFilePath}
                          onChange={(event) => setNewFilePath(event.target.value)}
                          placeholder={t("dashboard.editor.pathPlaceholder")}
                        />
                        <div className="hero-actions">
                          <button className="button" onClick={createEditorFile}>
                            <i className="fa-solid fa-plus" />
                            {t("dashboard.editor.create")}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="editor-main">
                      <div className="editor-header">
                        <div className="editor-file">
                          <i className="fa-solid fa-file-code" />
                          {editorFile || t("dashboard.editor.files")}
                        </div>
                        <div className="panel-actions">
                          <button
                            className="button secondary small"
                            onClick={() => loadEditorFile()}
                            disabled={!editorFile}
                          >
                            <i className="fa-solid fa-rotate" />
                            {t("dashboard.editor.load")}
                          </button>
                          <button
                            className="button small"
                            onClick={saveEditorFile}
                            disabled={!editorFile}
                          >
                            <i className="fa-solid fa-floppy-disk" />
                            {t("dashboard.editor.save")}
                          </button>
                        </div>
                      </div>
                      <CodeEditor
                        value={editorContent}
                        onChange={setEditorContent}
                        language="javascript"
                        minHeight={620}
                      />
                      {editorMessage ? (
                        <p className="muted">{editorMessage}</p>
                      ) : null}
                    </div>
                  </div>
                )
              ) : null}

              {editorType === "config" ? (
                <div className="editor-main">
                  <div className="editor-header">
                    <div className="editor-file">
                      <i className="fa-solid fa-sliders" />
                      {t("dashboard.config.title")}
                    </div>
                    <div className="panel-actions">
                      <button className="button small" onClick={saveConfig}>
                        <i className="fa-solid fa-floppy-disk" />
                        {t("dashboard.config.save")}
                      </button>
                    </div>
                  </div>
                  <p className="muted">{t("dashboard.config.subtitle")}</p>
                  <CodeEditor
                    value={configText}
                    onChange={setConfigText}
                    language="json"
                    minHeight={620}
                  />
                  {configMessage ? <p className="muted">{configMessage}</p> : null}
                  {configRestartKeys.length > 0 ? (
                    <p className="muted">{t("dashboard.config.restart")}</p>
                  ) : null}
                </div>
              ) : null}

              {editorType === "i18n" ? (
                <div className="editor-main">
                  <div className="editor-header">
                    <div className="editor-file">
                      <i className="fa-solid fa-language" />
                      {t("dashboard.admin.i18n.title")}
                    </div>
                    <div className="panel-actions inline-actions">
                      <select
                        className="select"
                        value={i18nLocale}
                        onChange={(event) => setI18nLocale(event.target.value)}
                      >
                        {localeOptions.map((loc) => (
                          <option key={loc} value={loc}>
                            {loc}
                          </option>
                        ))}
                      </select>
                      <button
                        className="button secondary small"
                        onClick={loadLocale}
                      >
                        <i className="fa-solid fa-rotate" />
                        {t("dashboard.admin.i18n.load")}
                      </button>
                      <button className="button small" onClick={saveLocale}>
                        <i className="fa-solid fa-floppy-disk" />
                        {t("dashboard.admin.i18n.save")}
                      </button>
                    </div>
                  </div>
                  <CodeEditor
                    value={i18nText}
                    onChange={setI18nText}
                    language="json"
                    minHeight={620}
                  />
                  {i18nMessage ? <p className="muted">{i18nMessage}</p> : null}
                </div>
              ) : null}
            </section>
          </Tabs.Content>

          <Tabs.Content value="db" className="tabs-content">
            <section className="panel fade-up">
              <div className="panel-header">
                <h2 className="panel-title">
                  <i className="fa-solid fa-table" />
                  {t("dashboard.admin.db.title")}
                </h2>
                <div className="panel-actions">
                  <span className="badge">
                    {t("dashboard.admin.db.columns")}: {tableColumns.length}
                  </span>
                  <span className="badge">
                    {t("dashboard.admin.db.rows")}: {gridRows.length}
                  </span>
                </div>
              </div>
              <div className="panel-actions db-toolbar">
                <div className="db-select">
                  <select
                    className="select"
                    value={selectedTable}
                    onChange={(event) => setSelectedTable(event.target.value)}
                  >
                    <option value="">{t("dashboard.admin.db.noTable")}</option>
                    {tables.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="button secondary small"
                    onClick={loadTableRows}
                  >
                    <i className="fa-solid fa-download" />
                    {t("dashboard.admin.db.loadTable")}
                  </button>
                </div>
                <div className="db-tools">
                  <button
                    className="button secondary small"
                    onClick={loadTables}
                  >
                    <i className="fa-solid fa-rotate" />
                    {t("dashboard.admin.db.tables")}
                  </button>
                  <div className="search-input compact">
                    <i className="fa-solid fa-filter" />
                    <input
                      value={tableSearch}
                      onChange={(event) => setTableSearch(event.target.value)}
                      placeholder={t("dashboard.admin.db.searchPlaceholder")}
                    />
                  </div>
                  <button
                    className="button ghost small"
                    onClick={() => setShowSql((prev) => !prev)}
                    disabled={!allowSql}
                  >
                    <i
                      className={`fa-solid ${
                        showSql ? "fa-eye-slash" : "fa-code"
                      }`}
                    />
                    {showSql
                      ? t("dashboard.admin.db.hideSql")
                      : t("dashboard.admin.db.showSql")}
                  </button>
                </div>
              </div>
              {tableColumns.length > 0 ? (
                <div className="data-grid-shell">
                  <DataGrid
                    className="data-grid"
                    columns={gridColumns}
                    rows={gridRows}
                    sortColumns={sortColumns}
                    onSortColumnsChange={setSortColumns}
                    rowKeyGetter={(row) => row.__rowId}
                  />
                </div>
              ) : (
                <p className="muted" style={{ marginTop: "12px" }}>
                  {t("dashboard.admin.db.noTable")}
                </p>
              )}
              {!allowSql && !showSql ? (
                <p className="muted" style={{ marginTop: "12px" }}>
                  {t("dashboard.admin.db.sqlDisabled")}
                </p>
              ) : null}
            </section>

            {showSql ? (
              <section className="panel fade-up">
                <div className="panel-header">
                  <h2 className="panel-title">
                    <i className="fa-solid fa-terminal" />
                    {t("dashboard.admin.db.sql")}
                  </h2>
                </div>
                <CodeEditor
                  value={sql}
                  onChange={setSql}
                  language="sql"
                  minHeight={260}
                />
                {!allowSql ? (
                  <p className="muted">{t("dashboard.admin.db.sqlDisabled")}</p>
                ) : (
                  <div className="hero-actions">
                    <button className="button" onClick={runSql}>
                      <i className="fa-solid fa-play" />
                      {t("dashboard.admin.db.execute")}
                    </button>
                  </div>
                )}
                {sqlResult ? (
                  <pre className="console" style={{ marginTop: "12px" }}>
                    {sqlResult}
                  </pre>
                ) : null}
              </section>
            ) : null}
          </Tabs.Content>

          <Tabs.Content value="console" className="tabs-content">
            <section className="panel fade-up">
              <div className="panel-header">
                <h2 className="panel-title">
                  <i className="fa-solid fa-terminal" />
                  {t("dashboard.admin.console.title")}
                </h2>
                <div className="panel-actions">
                  <button
                    className="button secondary small"
                    onClick={() => runAction("/api/admin/resume")}
                    disabled={actionStatus}
                  >
                    <i className="fa-solid fa-play" />
                    {t("dashboard.admin.console.start")}
                  </button>
                  <button
                    className="button secondary small"
                    onClick={() => runAction("/api/admin/pause")}
                    disabled={actionStatus}
                  >
                    <i className="fa-solid fa-stop" />
                    {t("dashboard.admin.console.stop")}
                  </button>
                  <button
                    className="button small"
                    onClick={() => runAction("/api/admin/reload")}
                    disabled={actionStatus}
                  >
                    <i className="fa-solid fa-rotate" />
                    {t("dashboard.admin.console.restart")}
                  </button>
                  <button
                    className="button secondary small"
                    onClick={() => runAction("/api/admin/reload-commands")}
                    disabled={actionStatus}
                  >
                    <i className="fa-solid fa-sitemap" />
                    {t("dashboard.admin.console.reloadCommands")}
                  </button>
                  <button
                    className="button secondary small"
                    onClick={() => runAction("/api/admin/reload-events")}
                    disabled={actionStatus}
                  >
                    <i className="fa-solid fa-bolt" />
                    {t("dashboard.admin.console.reloadEvents")}
                  </button>
                </div>
              </div>

              <div className="panel-header" style={{ marginTop: "16px" }}>
                <h3 className="panel-title">
                  <i className="fa-solid fa-gauge-high" />
                  {t("dashboard.admin.console.system")}
                </h3>
                <span className="badge">{t("dashboard.stats.title")}</span>
              </div>
              <div className="stats-grid">
                {systemCards.map((card) => (
                  <div key={card.key} className="stat-card fade-up">
                    <div className="stat-header">
                      <span className="stat-icon">
                        <i className={`fa-solid ${card.icon}`} />
                      </span>
                      <div className="stat-label">{card.label}</div>
                    </div>
                    <div className="stat-value">{card.value}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel fade-up">
              <div className="panel-header">
                <h3 className="panel-title">
                  <i className="fa-solid fa-terminal" />
                  {t("dashboard.admin.console.logs")}
                </h3>
                <button className="button secondary small" onClick={() => setLogs([])}>
                  <i className="fa-solid fa-trash" />
                  {t("dashboard.admin.console.clear")}
                </button>
              </div>
              <div className="console" ref={consoleRef}>
                {logs.length === 0 ? (
                  <div className="console-line">
                    {t("dashboard.admin.console.empty")}
                  </div>
                ) : (
                  logs.map((line, idx) => (
                    <div key={`${line.timestamp}-${idx}`} className="console-line">
                      [{line.timestamp}] {line.level?.toUpperCase?.() || "LOG"} {" "}
                      {line.message}
                    </div>
                  ))
                )}
              </div>
            </section>
          </Tabs.Content>
        </Tabs.Root>

        <Footer />
      </main>
    </AuthGate>
  );
}
