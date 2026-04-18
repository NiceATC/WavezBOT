"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as Tabs from "@radix-ui/react-tabs";
import DataGrid from "react-data-grid";
import {
  AreaChart, Area,
  LineChart, Line,
  BarChart, Bar, Cell,
  RadialBarChart, RadialBar,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import AuthGate from "../../components/AuthGate";
import CodeEditor from "../../components/CodeEditor";
import Footer from "../../components/Footer";
import Navbar from "../../components/Navbar";
import StatsGrid from "../../components/StatsGrid";
import ToastStack from "../../components/ToastStack";
import { formatBytes, formatRate, formatPoints, formatNumber } from "../../lib/format";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../lib/i18n";
import { useDashboardSocket } from "../../lib/socket";
import { publicFetch } from "../../lib/public-api";
import { getDefaultTheme, useTheme } from "../../lib/theme";
import prettier from "prettier/standalone";
import prettierBabel from "prettier/plugins/babel";
import prettierEstree from "prettier/plugins/estree";
import { diffLines } from "diff";

const MAX_LOGS = 800;

// ── Chart theme helpers ───────────────────────────────────────────────────
const CHART_COLORS = [
  "var(--accent)",
  "var(--accent-2)",
  "var(--accent-3)",
  "var(--accent-4)",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
];

// ── KPI card ─────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, color, trend }) {
  return (
    <div className="an-kpi" style={{ "--kc": color ?? "var(--accent)" }}>
      <div className="an-kpi-top">
        <div className="an-kpi-icon"><i className={`fa-solid ${icon}`} /></div>
        {(sub || trend !== undefined) && (
          <div className="an-kpi-meta">
            {trend !== undefined ? (
              <span className={`an-kpi-trend ${trend >= 0 ? "up" : "down"}`}>
                <i className={`fa-solid fa-arrow-${trend >= 0 ? "up" : "down"}-right`} />
                {Math.abs(trend)}%
              </span>
            ) : (
              sub && <span className="an-kpi-badge">{sub}</span>
            )}
          </div>
        )}
      </div>
      <div className="an-kpi-value">{value ?? "—"}</div>
      <div className="an-kpi-label">{label}</div>
    </div>
  );
}

// ── Top users mini table ──────────────────────────────────────────────────
function TopTable({ rows, valueKey, valueLabel, formatFn }) {
  if (!rows?.length) return <div className="an-empty">Sem dados</div>;
  const fmt = formatFn ?? ((v) => String(v ?? 0));
  return (
    <div className="an-top-table">
      {rows.map((row, i) => {
        const name = row.display_name || row.username || "?";
        const value = row[valueKey];
        return (
          <div key={i} className="an-top-row">
            <span className="an-top-pos">{i + 1}</span>
            <span className="an-top-name" title={name}>{name}</span>
            <span className="an-top-val">{fmt(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Analytics Tab ─────────────────────────────────────────────────────────
function AnalyticsTab({ t }) {
  const [ov, setOv] = useState(null);
  const locale = "pt-BR";

  const buildDailySeries = (rows, totalDays) => {
    const safeRows = Array.isArray(rows) ? rows : [];
    const byDay = new Map(
      safeRows.map((item) => [String(item?.day ?? ""), Number(item?.count ?? 0)]),
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const padded = [];
    for (let i = totalDays - 1; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const key = `${yyyy}-${mm}-${dd}`;
      padded.push({ day: key.slice(5), count: byDay.get(key) ?? 0 });
    }
    return padded;
  };

  useEffect(() => {
    let active = true;
    publicFetch("/api/overview").then((d) => { if (active) setOv(d); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const fp = (v) => ov ? formatPoints(v ?? 0, locale) : "—";
  const fn = (v) => ov ? formatNumber(v ?? 0, locale) : "—";
  const pctChange = (current, previous) => {
    const cur = Number(current ?? 0);
    const prev = Number(previous ?? 0);
    if (prev <= 0) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 100);
  };

  // Computed
  const active7pct  = ov && ov.totalUsers > 0 ? ((ov.activeUsers7d  / ov.totalUsers) * 100).toFixed(1) : "0";
  const active30pct = ov && ov.totalUsers > 0 ? ((ov.activeUsers30d / ov.totalUsers) * 100).toFixed(1) : "0";
  const active7Trend = pctChange(ov?.activeUsers7d, ov?.activeUsersPrev7d);
  const active30Trend = pctChange(ov?.activeUsers30d, ov?.activeUsersPrev30d);
  const plays30d    = (ov?.playsHistory ?? []).reduce((s, d) => s + d.count, 0);
  const healthPct   = ov && (ov.totalEarned ?? 0) > 0
    ? Math.min(100, Math.round((ov.totalBalance / ov.totalEarned) * 100))
    : null;
  const healthColor = healthPct === null ? "var(--muted)" : healthPct > 70 ? "#10b981" : healthPct > 40 ? "#f59e0b" : "#ef4444";

  // Chart data — only from fields that are actually written to DB
  const growthData = buildDailySeries(ov?.growth, 60);
  const playsData = buildDailySeries(ov?.playsHistory, 30);
  const econBar    = ov ? [
    { label: "Saldo atual",   value: ov.totalBalance ?? 0 },
    { label: "No banco",      value: ov.bankTotal    ?? 0 },
    { label: "Total ganho",   value: ov.totalEarned  ?? 0 },
    { label: "Total gasto",   value: ov.totalSpent   ?? 0 },
  ] : [];
  const healthRadial = healthPct !== null
    ? [{ name: "Saúde", value: healthPct, fill: healthColor }]
    : [];

  const tt = {
    contentStyle: {
      background: "var(--surface)",
      border: "1px solid var(--stroke)",
      borderRadius: 12,
      color: "var(--ink)",
      fontSize: 12,
    },
    labelStyle: { color: "var(--muted)", marginBottom: 4 },
  };

  if (!ov) {
    return (
      <div className="an-loading">
        <i className="fa-solid fa-circle-notch fa-spin" />
        <span>Carregando analytics…</span>
      </div>
    );
  }

  return (
    <div className="an-wrap">

      {/* ── Usuários ──────────────────────────────────────────────────── */}
      <div className="an-section-title"><i className="fa-solid fa-users" /> Usuários</div>
      <div className="an-kpi-grid an-kpi-grid--5">
        <KpiCard icon="fa-user-group"  label="Total de usuários"  value={fn(ov.totalUsers)}     color="var(--accent)"   />
        <KpiCard icon="fa-user-check"  label="Ativos (7 dias)"    value={fn(ov.activeUsers7d)}  sub={`${active7pct}% da base`}  trend={active7Trend} color="var(--accent-2)" />
        <KpiCard icon="fa-user-clock"  label="Ativos (30 dias)"   value={fn(ov.activeUsers30d)} sub={`${active30pct}% da base`} trend={active30Trend} color="var(--accent-2)" />
        <KpiCard icon="fa-comment"     label="Mensagens moderadas" value={fn(ov.totalChats)}     color="var(--accent-3)" />
        <KpiCard icon="fa-star"        label="XP acumulado"       value={fn(ov.totalXp)}        color="var(--accent-2)" />
      </div>

      <div className="an-charts-row an-charts-row--full">
        <div className="an-chart-card">
          <div className="an-chart-title"><i className="fa-solid fa-user-plus" /> Novos usuários (últimos 60 dias)</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={growthData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gGrow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--ink-rgb),0.06)" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} allowDecimals={false} width={30} />
              <Tooltip {...tt} />
              <Area type="monotone" dataKey="count" name="Novos usuários" stroke="var(--accent)" strokeWidth={2} fill="url(#gGrow)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Economia ──────────────────────────────────────────────────── */}
      <div className="an-section-title"><i className="fa-solid fa-coins" /> Economia</div>
      <div className="an-kpi-grid">
        <KpiCard icon="fa-building-columns" label="Saldo total circulante" value={fp(ov.totalBalance)} color="var(--accent-3)" sub={`${fn(ov.usersWithBalance)} usuários com saldo`} />
        <KpiCard icon="fa-person"           label="Saldo médio / usuário"  value={fp(ov.avgBalance)}   color="var(--accent-3)" />
        <KpiCard icon="fa-piggy-bank"       label="Total depositado (banco)" value={fp(ov.bankTotal)} sub={`${fn(ov.bankUsers)} contas`} color="var(--accent-2)" />
        <KpiCard icon="fa-arrow-trend-up"   label="Total ganho (histórico)" value={fp(ov.totalEarned)} color="#10b981" />
        <KpiCard icon="fa-cart-shopping"    label="Total gasto (histórico)" value={fp(ov.totalSpent)}  color="#ef4444" />
        <KpiCard icon="fa-users"            label="Usuários com saldo"     value={fn(ov.usersWithBalance)} color="var(--accent)" />
      </div>

      <div className="an-charts-row">
        <div className="an-chart-card an-chart-card--grow">
          <div className="an-chart-title"><i className="fa-solid fa-chart-column" /> Distribuição de moedas</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={econBar} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--ink-rgb),0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--ink)" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} tickFormatter={(v) => formatPoints(v, locale)} width={80} />
              <Tooltip {...tt} formatter={(v) => [formatPoints(v, locale), ""]} />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {econBar.map((_, i) => <Cell key={i} fill={["var(--accent-3)","var(--accent-2)","#10b981","#ef4444"][i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {healthRadial.length > 0 && (
          <div className="an-chart-card">
            <div className="an-chart-title"><i className="fa-solid fa-heart-pulse" /> Saúde da economia</div>
            <ResponsiveContainer width="100%" height={200}>
              <RadialBarChart innerRadius="55%" outerRadius="90%" data={healthRadial} startAngle={225} endAngle={-45}>
                <RadialBar dataKey="value" background={{ fill: "rgba(var(--ink-rgb),0.06)" }} cornerRadius={8} />
                <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" style={{ fill: "var(--ink)", fontSize: 28, fontWeight: 700 }}>
                  {healthPct}%
                </text>
                <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle" style={{ fill: "var(--muted)", fontSize: 12 }}>
                  em circulação
                </text>
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Rankings ──────────────────────────────────────────────────── */}
      <div className="an-section-title"><i className="fa-solid fa-trophy" /> Rankings</div>
      <div className="an-tops-grid">
        <div className="an-top-card">
          <div className="an-chart-title"><i className="fa-solid fa-crown" style={{ color: "#ffd700" }} /> Top Ricos</div>
          <TopTable rows={ov.topRichest} valueKey="balance" formatFn={fp} />
        </div>
        <div className="an-top-card">
          <div className="an-chart-title"><i className="fa-solid fa-comment" /> Top Chatters</div>
          <TopTable rows={ov.topChatters} valueKey="chat_count" formatFn={fn} />
        </div>
        <div className="an-top-card">
          <div className="an-chart-title"><i className="fa-solid fa-trophy" /> Casino — Mais vitórias</div>
          <TopTable rows={ov.topCasinoWinners} valueKey="casino_wins" formatFn={fn} />
        </div>
        <div className="an-top-card">
          <div className="an-chart-title"><i className="fa-solid fa-face-frown" /> Casino — Mais derrotas</div>
          <TopTable rows={ov.topCasinoLosers} valueKey="casino_losses" formatFn={fn} />
        </div>
        <div className="an-top-card">
          <div className="an-chart-title"><i className="fa-solid fa-headphones" /> Top DJs</div>
          <TopTable rows={ov.topDJs} valueKey="dj_plays" formatFn={fn} />
        </div>
        <div className="an-top-card">
          <div className="an-chart-title"><i className="fa-solid fa-bolt" /> Maior nível</div>
          {ov.topLevel ? (
            <div className="an-top-table">
              <div className="an-top-row">
                <span className="an-top-pos">1</span>
                <span className="an-top-name">{ov.topLevel.display_name || ov.topLevel.username || "?"}</span>
                <span className="an-top-val">Lv {ov.topLevel.level}</span>
              </div>
            </div>
          ) : <div className="an-empty">Sem dados</div>}
        </div>
      </div>

      {/* ── Música ────────────────────────────────────────────────────── */}
      <div className="an-section-title"><i className="fa-solid fa-music" /> Música</div>
      <div className="an-kpi-grid an-kpi-grid--4">
        <KpiCard icon="fa-play"         label="Plays totais"              value={fn(ov.totalPlays)}          color="var(--accent)"   />
        <KpiCard icon="fa-compact-disc" label="Plays (últimos 30 dias)"   value={fn(plays30d)}               color="var(--accent-2)" />
        <KpiCard icon="fa-ban"          label="Músicas na blacklist"      value={fn(ov.trackBlacklistCount)}  color="#f59e0b" />
        <KpiCard icon="fa-list-music"   label="Músicas catalogadas"       value={fn(ov.totalSongStats ?? 0)} color="var(--accent-3)" />
      </div>

      <div className="an-charts-row an-charts-row--full">
        <div className="an-chart-card">
          <div className="an-chart-title"><i className="fa-solid fa-compact-disc" /> Músicas tocadas por dia (últimos 30 dias)</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={playsData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gPlays" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-2)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--accent-2)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(var(--ink-rgb),0.06)" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} tickLine={false} axisLine={false} allowDecimals={false} width={30} />
              <Tooltip {...tt} />
              <Area type="monotone" dataKey="count" name="Plays" stroke="var(--accent-2)" strokeWidth={2} fill="url(#gPlays)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {ov.topSongs?.length > 0 && (
        <div className="an-songs-card">
          <div className="an-songs-header">
            <span>#</span><span>Título</span><span>Artista</span><span>Plays</span>
          </div>
          {ov.topSongs.map((s, i) => (
            <div key={i} className="an-songs-row">
              <span className="an-songs-pos">{i + 1}</span>
              <span className="an-songs-title" title={s.title}>{s.title || "—"}</span>
              <span className="an-songs-artist" title={s.artist}>{s.artist || "—"}</span>
              <span className="an-songs-val">{fn(s.plays)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Moderação ─────────────────────────────────────────────────── */}
      <div className="an-section-title"><i className="fa-solid fa-shield-halved" /> Moderação</div>
      <div className="an-kpi-grid">
        <KpiCard icon="fa-triangle-exclamation" label="Warnings ativos"      value={fn(ov.warningsActive)} color={ov.warningsActive > 0 ? "#ef4444" : "var(--accent)"} />
        <KpiCard icon="fa-circle-check"         label="Warnings resolvidos"  value={fn((ov.warningsTotal ?? 0) - (ov.warningsActive ?? 0))} color="#10b981" />
        <KpiCard icon="fa-gavel"                label="Total de warnings"    value={fn(ov.warningsTotal)}  color="var(--muted)" />
      </div>

      {/* ── Shop ──────────────────────────────────────────────────────── */}
      {ov.topShopItems?.length > 0 && (
        <>
          <div className="an-section-title"><i className="fa-solid fa-store" /> Shop — Itens mais comprados</div>
          <div className="an-kpi-grid an-kpi-grid--4">
            {ov.topShopItems.map((item, i) => (
              <KpiCard key={i} icon="fa-tag" label={item.item_key} value={fn(item.total) + "×"} color={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </div>
        </>
      )}

    </div>
  );
}

export default function AdminPage() {
  const { token, apiFetch, logout } = useAuth();
  const { t, locale, locales, reloadI18n } = useI18n();
  const { setTheme } = useTheme();
  const [stats, setStats] = useState(null);
  const [system, setSystem] = useState(null);
  const [logs, setLogs] = useState([]);
  const consoleRef = useRef(null);
  const [actionStatus, setActionStatus] = useState("");
  const [i18nText, setI18nText] = useState("");
  const [i18nLocale, setI18nLocale] = useState(locale);
  const [i18nMessage, setI18nMessage] = useState("");
  const [dbCatalog, setDbCatalog] = useState([]);
  const [selectedDb, setSelectedDb] = useState("");
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [tableTotal, setTableTotal] = useState(0);
  const [tableOffset, setTableOffset] = useState(0);
  const [tableColumns, setTableColumns] = useState([]);
  const [tableColumnMeta, setTableColumnMeta] = useState([]);
  const [tableRows, setTableRows] = useState([]);
  const [tableSearch, setTableSearch] = useState("");
  const [dbLoading, setDbLoading] = useState(false);
  const [dbMessage, setDbMessage] = useState("");
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [rowEditModal, setRowEditModal] = useState(null);
  const [rowDeleteConfirm, setRowDeleteConfirm] = useState(null);
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
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [diffSuggestions, setDiffSuggestions] = useState([]);
  const [editorMaximized, setEditorMaximized] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const [localeLoading, setLocaleLoading] = useState(false);
  const [fileEditEnabled, setFileEditEnabled] = useState(true);
  const editorBaselineRef = useRef("");
  const localeBaselineRef = useRef("");

  // Close maximized editor on Escape
  useEffect(() => {
    if (!editorMaximized) return;
    const onKey = (event) => { if (event.key === "Escape") setEditorMaximized(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editorMaximized]);
  const [modUsers, setModUsers] = useState([]);
  const [modLoading, setModLoading] = useState(false);
  const [modWarnings, setModWarnings] = useState([]);
  const [modSearch, setModSearch] = useState("");
  const [modSelectedUserId, setModSelectedUserId] = useState("");
  const [modBotMessage, setModBotMessage] = useState("");
  const [modOnlineOnly, setModOnlineOnly] = useState(false);
  const [modWarnOnly, setModWarnOnly] = useState(false);
  const [modWarningsOnlySelected, setModWarningsOnlySelected] = useState(true);
  const [modWarningsSearch, setModWarningsSearch] = useState("");
  const [modConfirm, setModConfirm] = useState(null);
  const [consoleConfirm, setConsoleConfirm] = useState(null);
  const [consoleLogTab, setConsoleLogTab] = useState("bot");
  const [toasts, setToasts] = useState([]);
  const [systemHistory, setSystemHistory] = useState([]);
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
  const visibleColumnMeta = useMemo(
    () => (showAllColumns ? tableColumnMeta : tableColumnMeta.slice(0, 8)),
    [showAllColumns, tableColumnMeta],
  );
  const hiddenColumnCount = Math.max(0, tableColumnMeta.length - visibleColumnMeta.length);

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
    if (token) loadDatabases();
  }, [token]);

  useEffect(() => {
    if (!toasts.length) return undefined;
    const timer = setInterval(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((toast) => toast.expiresAt > now));
    }, 300);
    return () => clearInterval(timer);
  }, [toasts]);

  useEffect(() => {
    if (!token) return;
    loadModerationData();
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
    if (!system) return;
    const point = {
      at: Date.now(),
      cpu: Number(system?.cpu?.loadPct ?? 0),
      memory: Number(system?.memory?.usedPct ?? 0),
      diskRead: Number(system?.disk?.readSec ?? 0),
      diskWrite: Number(system?.disk?.writeSec ?? 0),
      rx: Number(system?.network?.rxSec ?? 0),
      tx: Number(system?.network?.txSec ?? 0),
    };
    setSystemHistory((prev) => [...prev, point].slice(-40));
  }, [system]);

  useEffect(() => {
    if (token && i18nLocale) loadLocale();
  }, [token, i18nLocale]);

  useEffect(() => {
    if (token) loadConfig();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (
      editorType === "commands" ||
      editorType === "events" ||
      editorType === "config"
    ) {
      loadEditorFiles(editorType);
    }
  }, [token, editorType]);

  useEffect(() => {
    if (
      editorType === "commands" ||
      editorType === "events" ||
      editorType === "config"
    ) {
      setEditorFile("");
      setEditorContent("");
    }
  }, [editorType]);

  const runAction = async (path, opts = {}) => {
    if (!token) return;
    setActionStatus(path);
    try {
      await apiFetch(path, { method: "POST" });
      if (typeof opts.onSuccess === "function") {
        await opts.onSuccess();
      }
      if (opts.successMessage) {
        pushToast({
          title: t("dashboard.admin.console.title"),
          message: opts.successMessage,
          tone: "success",
        });
      }
    } catch (err) {
      pushToast({
        title: t("dashboard.admin.console.title"),
        message: err?.message || t("dashboard.errors.network"),
        tone: "error",
      });
    } finally {
      setActionStatus("");
    }
  };

  const runActionWithConfirm = (path, confirmData) => {
    setConsoleConfirm({ path, ...confirmData });
  };

  const confirmConsoleAction = async () => {
    if (!consoleConfirm) return;
    const { path, successMessage, onSuccess } = consoleConfirm;
    setConsoleConfirm(null);
    await runAction(path, { successMessage, onSuccess });
  };

  const pushToast = ({
    title = "",
    message = "",
    tone = "info",
    timeoutMs = 3500,
  }) => {
    if (!message) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const expiresAt = Date.now() + Math.max(1200, Number(timeoutMs) || 3500);
    setToasts((prev) => {
      const next = [...prev, { id, title, message, tone, expiresAt }];
      return next.slice(-5);
    });
  };

  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const loadModerationData = async () => {
    setModLoading(true);
    try {
      const [usersData, warningsData] = await Promise.all([
        apiFetch(`/api/mod/users?limit=1000`),
        apiFetch(`/api/mod/warnings?limit=1000`),
      ]);
      setModUsers(Array.isArray(usersData?.users) ? usersData.users : []);
      setModWarnings(Array.isArray(warningsData?.warnings) ? warningsData.warnings : []);
      if (!modSelectedUserId && Array.isArray(usersData?.users) && usersData.users[0]?.userId) {
        setModSelectedUserId(String(usersData.users[0].userId));
      }
    } catch {
      pushToast({
        title: t("dashboard.admin.moderation.toast.sectionTitle"),
        message: t("dashboard.errors.network"),
        tone: "error",
      });
    } finally {
      setModLoading(false);
    }
  };

  const runModAction = async (action) => {
    if (!modSelectedUserId) {
      pushToast({
        title: t("dashboard.admin.moderation.toast.selectionRequiredTitle"),
        message: t("dashboard.admin.moderation.toast.selectionRequiredAction"),
        tone: "warning",
      });
      return;
    }
    const targetName =
      selectedModUser?.displayName ||
      selectedModUser?.username ||
      selectedModUser?.userId ||
      modSelectedUserId;
    const labels = {
      warn: t("dashboard.admin.moderation.actions.warn"),
      kick: t("dashboard.admin.moderation.actions.kick"),
      mute: t("dashboard.admin.moderation.actions.mute"),
      unmute: t("dashboard.admin.moderation.actions.unmute"),
      ban: t("dashboard.admin.moderation.actions.ban"),
    };
    setModConfirm({
      kind: "action",
      action,
      targetName,
      title: labels[action] || t("dashboard.admin.moderation.modal.confirmActionTitle"),
      message: t("dashboard.admin.moderation.modal.confirmActionBody", { action: action.toUpperCase() }),
      confirmLabel: labels[action] || t("dashboard.admin.moderation.modal.confirm"),
      confirmTone: action === "ban" || action === "kick" ? "danger" : "normal",
      reason: "",
      durationMinutes: "30",
    });
  };

  const performModAction = async (action, payload = {}) => {
    try {
      await apiFetch("/api/mod/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          userId: modSelectedUserId,
          reason: String(payload?.reason || "").trim(),
          durationMinutes: Number(payload?.durationMinutes || 0) || 0,
        }),
      });
      const actionLabel =
        action === "warn" ? t("dashboard.admin.moderation.toast.actionSuccess.warn") :
        action === "kick" ? t("dashboard.admin.moderation.toast.actionSuccess.kick") :
        action === "ban" ? t("dashboard.admin.moderation.toast.actionSuccess.ban") :
        action === "mute" ? t("dashboard.admin.moderation.toast.actionSuccess.mute") :
        action === "unmute" ? t("dashboard.admin.moderation.toast.actionSuccess.unmute") :
        t("dashboard.admin.moderation.toast.actionSuccess.generic", { action });
      pushToast({
        title: t("dashboard.admin.moderation.toast.sectionTitle"),
        message: t("dashboard.admin.moderation.toast.actionSuccess.done", { action: actionLabel }),
        tone: "success",
      });
      await loadModerationData();
    } catch (err) {
      pushToast({
        title: t("dashboard.admin.moderation.toast.actionFailTitle"),
        message: err?.message || t("dashboard.admin.moderation.toast.actionFailMessage"),
        tone: "error",
        timeoutMs: 4200,
      });
    }
  };

  const openUserMessageModal = () => {
    if (!modSelectedUserId) {
      pushToast({
        title: t("dashboard.admin.moderation.toast.selectionRequiredTitle"),
        message: t("dashboard.admin.moderation.toast.selectionRequiredDm"),
        tone: "warning",
      });
      return;
    }
    const targetName =
      selectedModUser?.displayName ||
      selectedModUser?.username ||
      selectedModUser?.userId ||
      modSelectedUserId;
    setModConfirm({
      kind: "user-message",
      targetName,
      title: t("dashboard.admin.moderation.modal.userMessageTitle"),
      message: t("dashboard.admin.moderation.modal.userMessageBody"),
      confirmLabel: t("dashboard.admin.moderation.modal.sendMessage"),
      confirmTone: "normal",
      messageText: "",
    });
  };

  const sendBroadcastMessage = async () => {
    const text = String(modBotMessage || "").trim();
    if (!text) {
      pushToast({
        title: t("dashboard.admin.moderation.toast.emptyMessageTitle"),
        message: t("dashboard.admin.moderation.toast.emptyMessageBody"),
        tone: "warning",
      });
      return;
    }
    try {
      await apiFetch("/api/mod/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          mentionSelected: false,
        }),
      });
      pushToast({
        title: t("dashboard.admin.moderation.toast.broadcastSentTitle"),
        message: t("dashboard.admin.moderation.toast.broadcastSentBody"),
        tone: "success",
      });
      setModBotMessage("");
    } catch {
      pushToast({
        title: t("dashboard.admin.moderation.toast.sendFailTitle"),
        message: t("dashboard.admin.moderation.toast.sendFailBroadcast"),
        tone: "error",
      });
    }
  };

  const clearWarningsForSelectedUser = async () => {
    if (!modSelectedUserId) return;
    setModConfirm({
      title: t("dashboard.admin.moderation.modal.clearWarningsTitle"),
      message: t("dashboard.admin.moderation.modal.clearWarningsBody"),
      confirmLabel: t("dashboard.admin.moderation.modal.clear"),
      confirmTone: "danger",
      onConfirm: async () => {
        try {
          await apiFetch("/api/mod/warnings/clear", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: modSelectedUserId }),
          });
          pushToast({
            title: t("dashboard.admin.moderation.toast.warningsTitle"),
            message: t("dashboard.admin.moderation.toast.warningsCleared"),
            tone: "success",
          });
          await loadModerationData();
        } catch {
          pushToast({
            title: t("dashboard.admin.moderation.toast.warningsFailTitle"),
            message: t("dashboard.admin.moderation.toast.warningsClearFail"),
            tone: "error",
          });
        }
      },
    });
  };

  const deleteWarning = async (warningId) => {
    setModConfirm({
      title: t("dashboard.admin.moderation.modal.deleteWarningTitle", { id: warningId }),
      message: t("dashboard.admin.moderation.modal.deleteWarningBody"),
      confirmLabel: t("dashboard.admin.moderation.modal.delete"),
      confirmTone: "danger",
      onConfirm: async () => {
        try {
          await apiFetch(`/api/mod/warnings/${warningId}`, { method: "DELETE" });
          pushToast({
            title: t("dashboard.admin.moderation.toast.warningsTitle"),
            message: t("dashboard.admin.moderation.toast.warningRemoved"),
            tone: "success",
          });
          await loadModerationData();
        } catch {
          pushToast({
            title: t("dashboard.admin.moderation.toast.warningsFailTitle"),
            message: t("dashboard.admin.moderation.toast.warningRemoveFail"),
            tone: "error",
          });
        }
      },
    });
  };

  const updateModConfirmField = (field, value) => {
    setModConfirm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const confirmModerationDialog = async () => {
    if (!modConfirm) return;
    if (modConfirm.kind === "action") {
      const action = modConfirm.action;
      const reason = String(modConfirm.reason || "").trim();
      const durationMinutes = Number(modConfirm.durationMinutes || 0) || 0;
      setModConfirm(null);
      await performModAction(action, { reason, durationMinutes });
      return;
    }
    if (modConfirm.kind === "user-message") {
      const messageText = String(modConfirm.messageText || "").trim();
      if (!messageText) {
        pushToast({
          title: t("dashboard.admin.moderation.toast.emptyMessageTitle"),
          message: t("dashboard.admin.moderation.toast.emptyUserMessageBody"),
          tone: "warning",
        });
        return;
      }
      const selectedName = selectedModUser?.displayName || selectedModUser?.username || null;
      setModConfirm(null);
      try {
        await apiFetch("/api/mod/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: messageText,
            userId: modSelectedUserId,
            mentionSelected: true,
            displayName: selectedName,
          }),
        });
        pushToast({
          title: t("dashboard.admin.moderation.toast.messageSentTitle"),
          message: t("dashboard.admin.moderation.toast.messageSentMention"),
          tone: "success",
        });
      } catch {
        pushToast({
          title: t("dashboard.admin.moderation.toast.sendFailTitle"),
          message: t("dashboard.admin.moderation.toast.sendFailUser"),
          tone: "error",
        });
      }
      return;
    }
    if (modConfirm?.onConfirm) {
      const fn = modConfirm.onConfirm;
      setModConfirm(null);
      await fn();
    }
  };

  const modUsersFiltered = useMemo(() => {
    const term = String(modSearch || "").trim().toLowerCase();
    return (modUsers || []).filter((u) => {
      if (modOnlineOnly && !u.isOnline) return false;
      if (modWarnOnly && Number(u.activeWarnings || 0) <= 0) return false;
      if (!term) return true;
      return [u.userId, u.username, u.displayName]
        .map((v) => String(v || "").toLowerCase())
        .some((v) => v.includes(term));
    });
  }, [modUsers, modSearch, modOnlineOnly, modWarnOnly]);

  const selectedModUser = useMemo(
    () => modUsers.find((u) => String(u.userId) === String(modSelectedUserId)) || null,
    [modUsers, modSelectedUserId],
  );

  const modWarningsFiltered = useMemo(() => {
    const term = String(modWarningsSearch || "").trim().toLowerCase();
    return (modWarnings || []).filter((w) => {
      if (
        modWarningsOnlySelected &&
        modSelectedUserId &&
        String(w.user_id || "") !== String(modSelectedUserId)
      ) {
        return false;
      }
      if (!term) return true;
      return [w.reason, w.username, w.display_name, w.user_id]
        .map((v) => String(v || "").toLowerCase())
        .some((v) => v.includes(term));
    });
  }, [modWarnings, modWarningsSearch, modWarningsOnlySelected, modSelectedUserId]);

  const modOnlineCount = useMemo(
    () => (modUsers || []).filter((u) => u.isOnline).length,
    [modUsers],
  );
  const modWarnUsersCount = useMemo(
    () => (modUsers || []).filter((u) => Number(u.activeWarnings || 0) > 0).length,
    [modUsers],
  );

  const loadLocale = async () => {
    if (!i18nLocale) return;
    setI18nMessage("");
    setLocaleLoading(true);
    try {
      const data = await apiFetch(
        `/api/locales/${encodeURIComponent(i18nLocale)}`,
      );
      const content = JSON.stringify(data.data || {}, null, 2);
      setI18nText(content);
      localeBaselineRef.current = content;
    } catch {
      setI18nMessage(t("dashboard.errors.network"));
      pushToast({
        title: t("dashboard.admin.i18n.title"),
        message: t("dashboard.errors.network"),
        tone: "error",
      });
    } finally {
      setLocaleLoading(false);
    }
  };

  const saveLocale = async () => {
    if (!i18nLocale) return;
    setI18nMessage("");
    try {
      let parsed;
      try {
        parsed = JSON.parse(i18nText || "{}");
      } catch {
        setI18nMessage(t("dashboard.admin.i18n.invalidJson"));
        pushToast({
          title: t("dashboard.admin.i18n.title"),
          message: t("dashboard.admin.i18n.invalidJson"),
          tone: "warning",
        });
        return;
      }
      await apiFetch(`/api/locales/${encodeURIComponent(i18nLocale)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      localeBaselineRef.current = i18nText;
      setI18nMessage(t("dashboard.admin.i18n.saved"));
      pushToast({
        title: t("dashboard.admin.i18n.title"),
        message: t("dashboard.admin.i18n.saved"),
        tone: "success",
      });
    } catch {
      setI18nMessage(t("dashboard.errors.network"));
      pushToast({
        title: t("dashboard.admin.i18n.title"),
        message: t("dashboard.errors.network"),
        tone: "error",
      });
    }
  };

  const loadDatabases = async () => {
    setDbLoading(true);
    setDbMessage("");
    try {
      const data = await apiFetch("/api/db/databases");
      const databases = Array.isArray(data?.databases) ? data.databases : [];
      setDbCatalog(databases);
      const firstDb = databases[0]?.key || "";
      setSelectedDb((prev) => (prev && databases.some((d) => d.key === prev) ? prev : firstDb));
      setAllowSql(Boolean(data.allowSql));
    } catch (err) {
      setDbMessage(err?.message || t("dashboard.errors.network"));
    } finally {
      setDbLoading(false);
    }
  };

  useEffect(() => {
    const dbEntry = dbCatalog.find((db) => db.key === selectedDb);
    const nextTables = Array.isArray(dbEntry?.tables) ? dbEntry.tables : [];
    setTables(nextTables);
    if (!selectedTable || !nextTables.includes(selectedTable)) {
      setSelectedTable(nextTables[0] || "");
      setTableRows([]);
      setTableColumns([]);
      setTableColumnMeta([]);
      setTableTotal(0);
      setTableOffset(0);
      setTableSearch("");
      setShowAllColumns(false);
    }
  }, [dbCatalog, selectedDb]);

  const loadTableRows = async (offsetOverride = tableOffset) => {
    if (!selectedTable) return;
    const limit = 200;
    const nextOffset = Math.max(0, Number(offsetOverride) || 0);
    setDbMessage("");
    try {
      const data = await apiFetch(
        `/api/db/table?name=${encodeURIComponent(selectedTable)}&limit=${limit}&offset=${nextOffset}`,
      );
      const columns = Array.isArray(data.columns) ? data.columns : [];
      const rows = Array.isArray(data.rows) ? data.rows : [];
      setTableColumns(columns);
      setTableColumnMeta(Array.isArray(data.columnMeta) ? data.columnMeta : []);
      setTableRows(rows.map((row, idx) => ({ ...row, __rowId: idx })));
      setTableTotal(Number(data.total ?? rows.length) || rows.length);
      setTableOffset(nextOffset);
    } catch (err) {
      setTableRows([]);
      setTableTotal(0);
      setDbMessage(err?.message || t("dashboard.errors.network"));
    }
  };

  useEffect(() => {
    if (!selectedTable) return;
    setTableOffset(0);
    setTableSearch("");
    setShowAllColumns(false);
    loadTableRows(0);
  }, [selectedTable]);

  const openRowEditModal = (row) => {
    if (!selectedTable || !row) return;
    const pkColumns = tableColumnMeta.filter((col) => col.pk);
    if (!pkColumns.length) {
      pushToast({
        title: t("dashboard.admin.db.title"),
        message: t("dashboard.admin.db.editMissingPk"),
        tone: "warning",
      });
      return;
    }

    const where = {};
    for (const pk of pkColumns) {
      where[pk.name] = row?.[pk.name] ?? null;
    }

    const values = {};
    for (const col of tableColumnMeta) {
      if (col.pk) continue;
      values[col.name] = row?.[col.name] ?? null;
    }

    setRowEditModal({ table: selectedTable, where, values, meta: tableColumnMeta });
  };

  const updateRowEditField = (field, value) => {
    setRowEditModal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        values: {
          ...prev.values,
          [field]: value,
        },
      };
    });
  };

  const saveRowEditModal = async () => {
    if (!rowEditModal) return;
    try {
      await apiFetch("/api/db/row/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: rowEditModal.table,
          where: rowEditModal.where,
          values: rowEditModal.values,
        }),
      });
      pushToast({
        title: t("dashboard.admin.db.title"),
        message: t("dashboard.admin.db.rowSaved"),
        tone: "success",
      });
      setRowEditModal(null);
      await loadTableRows(tableOffset);
    } catch (err) {
      pushToast({
        title: t("dashboard.admin.db.title"),
        message: err?.message || t("dashboard.errors.network"),
        tone: "error",
      });
    }
  };

  const requestRowDelete = () => {
    if (!rowEditModal) return;
    setRowDeleteConfirm({
      table: rowEditModal.table,
      where: rowEditModal.where,
    });
  };

  const confirmRowDelete = async () => {
    if (!rowDeleteConfirm) return;
    try {
      await apiFetch("/api/db/row/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: rowDeleteConfirm.table,
          where: rowDeleteConfirm.where,
        }),
      });
      pushToast({
        title: t("dashboard.admin.db.title"),
        message: t("dashboard.admin.db.rowDeleted"),
        tone: "success",
      });
      setRowDeleteConfirm(null);
      setRowEditModal(null);
      await loadTableRows(tableOffset);
    } catch (err) {
      pushToast({
        title: t("dashboard.admin.db.title"),
        message: err?.message || t("dashboard.errors.network"),
        tone: "error",
      });
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
        pushToast({
          title: t("dashboard.editor.title"),
          message: t("dashboard.editor.disabled"),
          tone: "warning",
        });
      } else {
        setEditorMessage(t("dashboard.errors.network"));
        pushToast({
          title: t("dashboard.editor.title"),
          message: t("dashboard.errors.network"),
          tone: "error",
        });
      }
    }
  };

  const loadEditorFile = async (fileOverride) => {
    const file = fileOverride || editorFile;
    if (!file) return;
    setEditorMessage("");
    setEditorLoading(true);
    try {
      const data = await apiFetch(
        `/api/files/content?type=${editorType}&file=${encodeURIComponent(file)}`,
      );
      const content = data.content || "";
      setEditorContent(content);
      editorBaselineRef.current = content;
    } catch (err) {
      if (err?.code === "file_edit_disabled") {
        setFileEditEnabled(false);
        setEditorMessage(t("dashboard.editor.disabled"));
      } else {
        setEditorMessage(t("dashboard.errors.network"));
        pushToast({
          title: t("dashboard.editor.title"),
          message: t("dashboard.errors.network"),
          tone: "error",
        });
      }
    } finally {
      setEditorLoading(false);
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
      pushToast({
        title: t("dashboard.editor.title"),
        message: t("dashboard.editor.saved"),
        tone: "success",
      });
      await loadEditorFile(editorFile);
      await loadEditorFiles(editorType);
    } catch (err) {
      if (err?.code === "file_edit_disabled") {
        setFileEditEnabled(false);
        setEditorMessage(t("dashboard.editor.disabled"));
        pushToast({
          title: t("dashboard.editor.title"),
          message: t("dashboard.editor.disabled"),
          tone: "warning",
        });
      } else {
        setEditorMessage(t("dashboard.errors.network"));
        pushToast({
          title: t("dashboard.editor.title"),
          message: t("dashboard.errors.network"),
          tone: "error",
        });
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
      pushToast({
        title: t("dashboard.editor.title"),
        message: t("dashboard.editor.created"),
        tone: "success",
      });
      setNewFilePath("");
      loadEditorFiles(editorType);
    } catch (err) {
      if (err?.code === "file_edit_disabled") {
        setFileEditEnabled(false);
        setEditorMessage(t("dashboard.editor.disabled"));
        pushToast({
          title: t("dashboard.editor.title"),
          message: t("dashboard.editor.disabled"),
          tone: "warning",
        });
      } else {
        setEditorMessage(t("dashboard.errors.network"));
        pushToast({
          title: t("dashboard.editor.title"),
          message: t("dashboard.errors.network"),
          tone: "error",
        });
      }
    }
  };

  const formatEditorDocument = async () => {
    const isI18nMode = editorType === "i18n";
    const source = isI18nMode ? i18nText : editorContent;
    const parser =
      isI18nMode || editorType === "config"
        ? "json"
        : "babel";

    try {
      const formatted = await prettier.format(source || "", {
        parser,
        plugins: [prettierBabel, prettierEstree],
        tabWidth: 2,
        printWidth: 100,
        trailingComma: "all",
        singleQuote: true,
        semi: true,
      });

      if (isI18nMode) {
        setI18nText(formatted);
      } else {
        setEditorContent(formatted);
      }

      pushToast({
        title: t("dashboard.editor.title"),
        message: t("dashboard.editor.formatted"),
        tone: "success",
      });
    } catch {
      const message = t("dashboard.editor.formatError");
      if (isI18nMode) {
        setI18nMessage(message);
      } else {
        setEditorMessage(message);
      }
      pushToast({
        title: t("dashboard.editor.title"),
        message,
        tone: "warning",
      });
    }
  };

  const buildDiffSuggestions = (previousContent, currentContent) => {
    const changes = diffLines(previousContent || "", currentContent || "");
    const items = [];
    let oldLine = 1;
    let newLine = 1;

    for (const part of changes) {
      const lines = String(part.value || "").split("\n");
      if (lines.length && lines[lines.length - 1] === "") lines.pop();

      if (part.added) {
        lines.forEach((line) => {
          items.push({ kind: "added", line: newLine, text: line });
          newLine += 1;
        });
      } else if (part.removed) {
        lines.forEach((line) => {
          items.push({ kind: "removed", line: oldLine, text: line });
          oldLine += 1;
        });
      } else {
        oldLine += lines.length;
        newLine += lines.length;
      }
    }

    return items.slice(0, 300);
  };

  const openDiffPreview = () => {
    const isI18nMode = editorType === "i18n";
    const previousContent = isI18nMode
      ? localeBaselineRef.current
      : editorBaselineRef.current;
    const currentContent = isI18nMode ? i18nText : editorContent;

    const suggestions = buildDiffSuggestions(previousContent, currentContent);
    if (!suggestions.length) {
      pushToast({
        title: t("dashboard.editor.title"),
        message: t("dashboard.editor.diffNoChanges"),
        tone: "warning",
      });
      return;
    }
    setDiffSuggestions(suggestions);
    setShowDiffModal(true);
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
  const diskIoLabel =
    systemStats.disk?.readSec != null && systemStats.disk?.writeSec != null
      ? `R ${formatRate(systemStats.disk.readSec)} | W ${formatRate(systemStats.disk.writeSec)}`
      : empty;
  const netLabel =
    systemStats.network?.rxSec != null && systemStats.network?.txSec != null
      ? `↓ ${formatRate(systemStats.network.rxSec)}  ↑ ${formatRate(
          systemStats.network.txSec,
        )}`
      : empty;
  const pingLabel =
    systemStats.pingMs != null ? `${systemStats.pingMs} ms` : empty;

  const chartData = systemHistory.map((item) => ({
    t: new Date(item.at).toLocaleTimeString(locale || "pt-BR", {
      minute: "2-digit",
      second: "2-digit",
    }),
    cpu: item.cpu,
    memory: item.memory,
    diskRead: item.diskRead,
    diskWrite: item.diskWrite,
    rx: item.rx,
    tx: item.tx,
  }));

  const maxNetwork = chartData.reduce((acc, item) => {
    const localMax = Math.max(Number(item.rx || 0), Number(item.tx || 0));
    return Math.max(acc, localMax);
  }, 1);
  const maxDiskIo = chartData.reduce((acc, item) => {
    const localMax = Math.max(Number(item.diskRead || 0), Number(item.diskWrite || 0));
    return Math.max(acc, localMax);
  }, 1);

  const systemCards = [
    {
      key: "cpu",
      label: t("dashboard.admin.console.cpu"),
      value: cpuLabel,
      icon: "fa-microchip",
      chart: (
        <ResponsiveContainer width="100%" height={58}>
          <LineChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <Line type="monotone" dataKey="cpu" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      ),
    },
    {
      key: "memory",
      label: t("dashboard.admin.console.memory"),
      value: memLabel,
      icon: "fa-memory",
      chart: (
        <ResponsiveContainer width="100%" height={58}>
          <LineChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <Line type="monotone" dataKey="memory" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      ),
    },
    {
      key: "disk",
      label: t("dashboard.admin.console.disk"),
      value: diskLabel,
      subValue: diskIoLabel,
      icon: "fa-hard-drive",
      chart: (
        <ResponsiveContainer width="100%" height={58}>
          <LineChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <Line type="monotone" dataKey="diskRead" stroke="#22c55e" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="diskWrite" stroke="#06b6d4" strokeWidth={2} dot={false} isAnimationActive={false} />
            <YAxis hide domain={[0, Math.max(maxDiskIo, 1)]} />
          </LineChart>
        </ResponsiveContainer>
      ),
    },
    {
      key: "network",
      label: t("dashboard.admin.console.network"),
      value: netLabel,
      icon: "fa-network-wired",
      subValue: `IN ${formatRate(systemStats.network?.rxSec || 0)} | OUT ${formatRate(systemStats.network?.txSec || 0)}`,
      chart: (
        <ResponsiveContainer width="100%" height={58}>
          <LineChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <Line
              type="monotone"
              dataKey="rx"
              stroke="#0ea5a3"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="tx"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <YAxis hide domain={[0, Math.max(maxNetwork, 1)]} />
          </LineChart>
        </ResponsiveContainer>
      ),
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
            <Navbar autowootUrl={autowootUrl} isAdmin />
          </div>
        </header>

        <Tabs.Root defaultValue="analytics" className="tabs-root">
          <Tabs.List className="tabs-list">
            <Tabs.Trigger value="analytics" className="tabs-trigger">
              <i className="fa-solid fa-chart-pie" />
              Analytics
            </Tabs.Trigger>
            <Tabs.Trigger value="moderation" className="tabs-trigger">
              <i className="fa-solid fa-user-shield" />
              {t("dashboard.admin.moderation.tab")}
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

          <Tabs.Content value="analytics" className="tabs-content">
            <AnalyticsTab t={t} />
          </Tabs.Content>

          <Tabs.Content value="moderation" className="tabs-content">
            <section className="panel fade-up">
              <div className="panel-header">
                <h2 className="panel-title">
                  <i className="fa-solid fa-user-shield" />
                  {t("dashboard.admin.moderation.title")}
                </h2>
                <div className="panel-actions">
                  <button className="button secondary small" onClick={loadModerationData} disabled={modLoading}>
                    <i className={`fa-solid ${modLoading ? "fa-circle-notch fa-spin" : "fa-rotate"}`} />
                    {t("dashboard.admin.moderation.refresh")}
                  </button>
                </div>
              </div>

              <div className="stats-grid" style={{ marginBottom: "14px" }}>
                <div className="stat-card">
                  <div className="stat-label">{t("dashboard.admin.moderation.stats.totalUsers")}</div>
                  <div className="stat-value">{modUsers.length}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">{t("dashboard.admin.moderation.stats.online")}</div>
                  <div className="stat-value">{modOnlineCount}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">{t("dashboard.admin.moderation.stats.withWarnings")}</div>
                  <div className="stat-value">{modWarnUsersCount}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">{t("dashboard.admin.moderation.stats.activeWarnings")}</div>
                  <div className="stat-value">{modWarnings.length}</div>
                </div>
              </div>

              <div className="panel-grid panel-grid-2 mod-layout-grid">
                <div>
                  <div className="panel-header" style={{ marginBottom: "10px" }}>
                    <h3 className="panel-title">
                      <i className="fa-solid fa-users" />
                      {t("dashboard.admin.moderation.users.title")}
                    </h3>
                    <span className="badge">{modUsersFiltered.length}</span>
                  </div>
                  <div className="search-input compact" style={{ marginBottom: "10px" }}>
                    <i className="fa-solid fa-magnifying-glass" />
                    <input
                      value={modSearch}
                      onChange={(event) => setModSearch(event.target.value)}
                      placeholder={t("dashboard.admin.moderation.users.searchPlaceholder")}
                    />
                  </div>
                  <div className="command-actions" style={{ marginBottom: "10px" }}>
                    <button
                      className={`button secondary small ${modOnlineOnly ? "accent" : ""}`}
                      onClick={() => setModOnlineOnly((v) => !v)}
                    >
                      <i className="fa-solid fa-circle" />
                      {t("dashboard.admin.moderation.users.onlineOnly")}
                    </button>
                    <button
                      className={`button secondary small ${modWarnOnly ? "accent" : ""}`}
                      onClick={() => setModWarnOnly((v) => !v)}
                    >
                      <i className="fa-solid fa-triangle-exclamation" />
                      {t("dashboard.admin.moderation.users.withWarningsOnly")}
                    </button>
                  </div>
                  <div className="mod-user-list">
                    {modUsersFiltered.length === 0 ? (
                      <p className="muted">{t("dashboard.admin.moderation.users.empty")}</p>
                    ) : modUsersFiltered.map((u) => {
                      const active = String(u.userId) === String(modSelectedUserId);
                      const name = u.displayName || u.username || u.userId;
                      return (
                        <button
                          key={u.userId}
                          className={`mod-user-row ${active ? "is-active" : ""}`}
                          onClick={() => setModSelectedUserId(String(u.userId))}
                        >
                          <span className="mod-user-main">
                            <i className={`fa-solid ${u.isOnline ? "fa-circle" : "fa-moon"}`} style={{ color: u.isOnline ? "#10b981" : "var(--muted)" }} />
                            <span className="mod-user-name">{name}</span>
                          </span>
                          <span className="badge">{t("dashboard.admin.moderation.users.warnBadge", { count: u.activeWarnings ?? 0 })}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="panel-header" style={{ marginBottom: "10px" }}>
                    <h3 className="panel-title">
                      <i className="fa-solid fa-gavel" />
                      {t("dashboard.admin.moderation.actions.title")}
                    </h3>
                  </div>
                  <div className="panel" style={{ marginBottom: "12px", padding: "12px" }}>
                    <div className="panel-header" style={{ marginBottom: "8px" }}>
                      <h3 className="panel-title">
                        <i className="fa-solid fa-id-card" /> {t("dashboard.admin.moderation.selected.title")}
                      </h3>
                    </div>
                    {selectedModUser ? (
                      <div className="mod-selected-card">
                        <div className="mod-selected-avatar" aria-hidden="true">
                          {String(selectedModUser.displayName || selectedModUser.username || selectedModUser.userId || "?")
                            .trim()
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                        <div className="mod-selected-body">
                          <div className="mod-selected-title">
                            {selectedModUser.displayName || selectedModUser.username || selectedModUser.userId}
                          </div>
                          <div className="mod-selected-id">{t("dashboard.admin.moderation.selected.id", { id: selectedModUser.userId })}</div>
                          <div className="mod-selected-tags">
                            <span className={`mod-tag ${selectedModUser.isOnline ? "ok" : "idle"}`}>
                              <i className={`fa-solid ${selectedModUser.isOnline ? "fa-signal" : "fa-moon"}`} />
                              {selectedModUser.isOnline ? t("dashboard.admin.moderation.selected.online") : t("dashboard.admin.moderation.selected.offline")}
                            </span>
                            <span className="mod-tag warn">
                              <i className="fa-solid fa-triangle-exclamation" />
                              {t("dashboard.admin.moderation.selected.activeWarnings", { count: selectedModUser.activeWarnings || 0 })}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="muted">{t("dashboard.admin.moderation.selected.none")}</p>
                    )}
                  </div>
                  <div className="command-actions mod-actions" style={{ marginBottom: "12px" }}>
                    <button className="button secondary small" onClick={() => runModAction("warn")}>
                      <i className="fa-solid fa-triangle-exclamation" /> {t("dashboard.admin.moderation.actions.warn")}
                    </button>
                    <button className="button secondary small" onClick={openUserMessageModal}>
                      <i className="fa-solid fa-paper-plane" /> {t("dashboard.admin.moderation.actions.userMessage")}
                    </button>
                    <button className="button secondary small" onClick={() => runModAction("kick")}>
                      <i className="fa-solid fa-user-slash" /> {t("dashboard.admin.moderation.actions.kick")}
                    </button>
                    <button className="button secondary small" onClick={() => runModAction("mute")}>
                      <i className="fa-solid fa-volume-xmark" /> {t("dashboard.admin.moderation.actions.mute")}
                    </button>
                    <button className="button secondary small" onClick={() => runModAction("unmute")}>
                      <i className="fa-solid fa-volume-high" /> {t("dashboard.admin.moderation.actions.unmute")}
                    </button>
                    <button className="button" onClick={() => runModAction("ban")}>
                      <i className="fa-solid fa-ban" /> {t("dashboard.admin.moderation.actions.ban")}
                    </button>
                  </div>

                  <div className="panel-header" style={{ marginBottom: "8px" }}>
                    <h3 className="panel-title">
                      <i className="fa-solid fa-paper-plane" />
                      {t("dashboard.admin.moderation.broadcast.title")}
                    </h3>
                  </div>
                  <div className="mod-message-box" style={{ marginBottom: "12px" }}>
                    <input
                      className="input"
                      value={modBotMessage}
                      onChange={(event) => setModBotMessage(event.target.value)}
                      placeholder={t("dashboard.admin.moderation.broadcast.placeholder")}
                    />
                    <button className="button" onClick={sendBroadcastMessage}>
                      <i className="fa-solid fa-paper-plane" /> {t("dashboard.admin.moderation.broadcast.send")}
                    </button>
                  </div>
                  <p className="muted" style={{ marginBottom: "8px" }}>
                    {t("dashboard.admin.moderation.broadcast.hint")}
                  </p>
                </div>
              </div>
            </section>

            <section className="panel fade-up">
              <div className="panel-header">
                <h2 className="panel-title">
                  <i className="fa-solid fa-list-check" />
                  {t("dashboard.admin.moderation.warnings.title")}
                </h2>
                <div className="panel-actions">
                  <button
                    className={`button secondary small ${modWarningsOnlySelected ? "accent" : ""}`}
                    onClick={() => setModWarningsOnlySelected((v) => !v)}
                  >
                    <i className="fa-solid fa-filter" />
                    {modWarningsOnlySelected
                      ? t("dashboard.admin.moderation.warnings.onlySelected")
                      : t("dashboard.admin.moderation.warnings.allUsers")}
                  </button>
                  <button className="button secondary small" onClick={clearWarningsForSelectedUser}>
                    <i className="fa-solid fa-broom" />
                    {t("dashboard.admin.moderation.warnings.clearSelected")}
                  </button>
                </div>
              </div>
              <div className="search-input compact" style={{ marginBottom: "10px" }}>
                <i className="fa-solid fa-magnifying-glass" />
                <input
                  value={modWarningsSearch}
                  onChange={(event) => setModWarningsSearch(event.target.value)}
                  placeholder={t("dashboard.admin.moderation.warnings.searchPlaceholder")}
                />
              </div>
              <div className="mod-warn-list">
                {modWarningsFiltered.length === 0 ? (
                  <div className="muted">{t("dashboard.admin.moderation.warnings.empty")}</div>
                ) : (
                  modWarningsFiltered.map((w) => {
                    const userLabel = w.display_name || w.username || w.user_id;
                    const modLabel =
                      w.moderator_display_name ||
                      w.moderator_username ||
                      w.moderator_user_id ||
                      t("dashboard.admin.moderation.warnings.system");
                    const created = w.created_at ? new Date(w.created_at).toLocaleString(locale || "pt-BR") : "-";
                    return (
                      <div key={w.id} className="mod-warn-row">
                        <div>
                          <strong>#{w.id}</strong> {userLabel} - {w.reason || t("dashboard.admin.moderation.warnings.noReason")} ({created}) {t("dashboard.admin.moderation.warnings.by")} {modLabel}
                        </div>
                        <button className="button ghost small" onClick={() => deleteWarning(w.id)}>
                          <i className="fa-solid fa-trash" /> {t("dashboard.admin.moderation.modal.delete")}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </Tabs.Content>

          <Tabs.Content value="theme" className="tabs-content tabs-content-tight">
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

          <Tabs.Content value="editor" className="tabs-content tabs-content-tight">
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

              {editorType === "commands" || editorType === "events" || editorType === "config" ? (
                !fileEditEnabled ? (
                  <p className="muted">{t("dashboard.editor.disabled")}</p>
                ) : (
                  <div className="editor-shell">
                    <div className="editor-sidebar">
                      <div className="editor-sidebar-files">
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
                                <i className={`fa-solid ${editorType === "config" ? "fa-file-lines" : "fa-file-code"}`} />
                                {file}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="editor-main">
                      <div className="editor-header">
                        <div className="editor-file">
                          <i className={`fa-solid ${editorType === "config" ? "fa-file-lines" : "fa-file-code"}`} />
                          {editorFile || t("dashboard.editor.files")}
                        </div>
                        <div className="panel-actions">
                          <button
                            className="button secondary small"
                            onClick={() => loadEditorFile()}
                            disabled={!editorFile || editorLoading}
                          >
                            <i className={`fa-solid ${editorLoading ? "fa-circle-notch fa-spin" : "fa-rotate"}`} />
                            {t("dashboard.editor.load")}
                          </button>
                          {editorType !== "config" ? (
                            <button
                              className="button secondary small"
                              onClick={() => setShowNewFileModal(true)}
                            >
                              <i className="fa-solid fa-plus" />
                              {t("dashboard.editor.create")}
                            </button>
                          ) : null}
                          <button
                            className="button small"
                            onClick={saveEditorFile}
                            disabled={!editorFile}
                          >
                            <i className="fa-solid fa-floppy-disk" />
                            {t("dashboard.editor.save")}
                          </button>
                          <button
                            className="button secondary small"
                            onClick={formatEditorDocument}
                          >
                            <i className="fa-solid fa-wand-magic-sparkles" />
                            {t("dashboard.editor.format")}
                          </button>
                          <button
                            className="button secondary small"
                            onClick={openDiffPreview}
                          >
                            <i className="fa-solid fa-code-compare" />
                            {t("dashboard.editor.diff")}
                          </button>
                          <button
                            className="button secondary small"
                            onClick={() => setEditorMaximized(true)}
                            title={t("dashboard.editor.maximize")}
                          >
                            <i className="fa-solid fa-expand" />
                          </button>
                        </div>
                      </div>
                      <CodeEditor
                        value={editorContent}
                        onChange={setEditorContent}
                        language={editorType === "config" ? "json" : "javascript"}
                        minHeight={620}
                      />
                      {editorMessage ? (
                        <p className="muted">{editorMessage}</p>
                      ) : null}
                    </div>
                  </div>
                )
              ) : null}

              {editorType === "i18n" ? (
                <div className="editor-shell">
                  <div className="editor-sidebar">
                    <div className="editor-sidebar-files">
                      <div className="panel-header" style={{ marginBottom: "8px" }}>
                        <h3 className="panel-title">
                          <i className="fa-solid fa-folder-open" />
                          {t("dashboard.editor.files")}
                        </h3>
                        <span className="badge">{localeOptions.length}</span>
                      </div>
                      <div className="file-list">
                        {localeOptions.map((loc) => (
                          <button
                            key={loc}
                            className={`file-item ${i18nLocale === loc ? "active" : ""}`}
                            onClick={() => setI18nLocale(loc)}
                          >
                            <i className="fa-solid fa-language" />
                            {loc}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="editor-main">
                    <div className="editor-header">
                      <div className="editor-file">
                        <i className="fa-solid fa-language" />
                        {i18nLocale || t("dashboard.admin.i18n.title")}
                      </div>
                      <div className="panel-actions inline-actions">
                        <button
                          className="button secondary small"
                          onClick={loadLocale}
                          disabled={!i18nLocale || localeLoading}
                        >
                          <i className={`fa-solid ${localeLoading ? "fa-circle-notch fa-spin" : "fa-rotate"}`} />
                          {t("dashboard.admin.i18n.load")}
                        </button>
                        <button className="button small" onClick={saveLocale}>
                          <i className="fa-solid fa-floppy-disk" />
                          {t("dashboard.admin.i18n.save")}
                        </button>
                        <button
                          className="button secondary small"
                          onClick={formatEditorDocument}
                        >
                          <i className="fa-solid fa-wand-magic-sparkles" />
                          {t("dashboard.editor.format")}
                        </button>
                        <button
                          className="button secondary small"
                          onClick={openDiffPreview}
                        >
                          <i className="fa-solid fa-code-compare" />
                          {t("dashboard.editor.diff")}
                        </button>
                        <button
                          className="button secondary small"
                          onClick={() => setEditorMaximized(true)}
                          title={t("dashboard.editor.maximize")}
                        >
                          <i className="fa-solid fa-expand" />
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
                </div>
              ) : null}
            </section>
          </Tabs.Content>

          <Tabs.Content value="db" className="tabs-content tabs-content-tight">
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
              <div className="db-pills" style={{ marginBottom: "12px" }}>
                {dbCatalog.map((db) => (
                  <button
                    key={db.key}
                    className={`db-pill ${selectedDb === db.key ? "active" : ""}`}
                    onClick={() => setSelectedDb(db.key)}
                  >
                    <i className="fa-solid fa-database" />
                    {db.key}
                    <span className="db-pill-count">{db.tables?.length || 0}</span>
                  </button>
                ))}
                <button className="button secondary small" onClick={loadDatabases} disabled={dbLoading}>
                  <i className={`fa-solid ${dbLoading ? "fa-circle-notch fa-spin" : "fa-rotate"}`} />
                  {t("dashboard.admin.db.tables")}
                </button>
              </div>

              <div className="db-layout">
                <aside className="db-sidebar">
                  <div className="panel-header" style={{ marginBottom: "10px" }}>
                    <h3 className="panel-title">
                      <i className="fa-solid fa-table-list" />
                      {t("dashboard.admin.db.tables")}
                    </h3>
                    <span className="badge">{tables.length}</span>
                  </div>
                  <div className="file-list">
                    {tables.length === 0 ? (
                      <div className="muted">{t("dashboard.admin.db.noTable")}</div>
                    ) : (
                      tables.map((name) => (
                        <button
                          key={name}
                          className={`file-item ${selectedTable === name ? "active" : ""}`}
                          onClick={() => setSelectedTable(name)}
                        >
                          <i className="fa-solid fa-table-cells" />
                          {name}
                        </button>
                      ))
                    )}
                  </div>
                </aside>

                <div className="db-main">
                  <div className="panel-header" style={{ marginBottom: "10px" }}>
                    <h3 className="panel-title">
                      <i className="fa-solid fa-layer-group" />
                      {selectedTable || t("dashboard.admin.db.noTable")}
                    </h3>
                    <div className="panel-actions">
                      <button className="button secondary small" onClick={() => loadTableRows(tableOffset)} disabled={!selectedTable}>
                        <i className="fa-solid fa-download" />
                        {t("dashboard.admin.db.loadTable")}
                      </button>
                      <div className="search-input compact">
                        <i className="fa-solid fa-filter" />
                        <input
                          value={tableSearch}
                          onChange={(event) => setTableSearch(event.target.value)}
                          placeholder={t("dashboard.admin.db.searchPlaceholder")}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="db-columns-panel">
                    {visibleColumnMeta.map((col) => (
                      <span key={col.name} className={`db-col-chip ${col.pk ? "pk" : ""}`}>
                        {col.name}
                        <em>{col.type || "text"}</em>
                        {col.pk ? <strong>PK</strong> : null}
                      </span>
                    ))}
                    {hiddenColumnCount > 0 ? (
                      <button
                        className="button secondary small"
                        onClick={() => setShowAllColumns(true)}
                        type="button"
                      >
                        +{hiddenColumnCount} {t("dashboard.admin.db.columns")}
                      </button>
                    ) : null}
                    {showAllColumns && tableColumnMeta.length > 8 ? (
                      <button
                        className="button secondary small"
                        onClick={() => setShowAllColumns(false)}
                        type="button"
                      >
                        {t("dashboard.admin.db.showLessColumns")}
                      </button>
                    ) : null}
                  </div>

                  {tableColumns.length > 0 ? (
                    <div className="data-grid-shell">
                      <DataGrid
                        className="data-grid"
                        columns={[
                          {
                            key: "__actions",
                            name: t("dashboard.admin.db.actions"),
                            width: 110,
                            renderCell: ({ row }) => (
                              <button className="button ghost small" onClick={() => openRowEditModal(row)}>
                                <i className="fa-solid fa-pen" /> {t("dashboard.admin.db.edit")}
                              </button>
                            ),
                          },
                          ...gridColumns,
                        ]}
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

                  {tableColumns.length > 0 && gridRows.length === 0 ? (
                    <p className="muted" style={{ marginTop: "10px" }}>
                      {t("dashboard.admin.db.noRows")}
                    </p>
                  ) : null}

                  {dbMessage ? (
                    <p className="muted" style={{ marginTop: "10px", color: "var(--danger)" }}>
                      {dbMessage}
                    </p>
                  ) : null}

                  <div className="panel-actions" style={{ marginTop: "10px", justifyContent: "space-between" }}>
                    <span className="muted">{t("dashboard.admin.db.totalRows", { count: tableTotal })}</span>
                    <div className="panel-actions">
                      <button
                        className="button secondary small"
                        onClick={() => loadTableRows(Math.max(0, tableOffset - 200))}
                        disabled={tableOffset <= 0}
                      >
                        <i className="fa-solid fa-chevron-left" />
                        {t("dashboard.admin.db.prev")}
                      </button>
                      <button
                        className="button secondary small"
                        onClick={() => loadTableRows(tableOffset + 200)}
                        disabled={tableOffset + 200 >= tableTotal}
                      >
                        {t("dashboard.admin.db.next")}
                        <i className="fa-solid fa-chevron-right" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

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

            {rowEditModal ? (
              <div className="mod-modal-backdrop" role="dialog" aria-modal="true">
                <div className="mod-modal mod-modal-lg">
                  <h3 className="panel-title" style={{ marginBottom: "8px" }}>
                    <i className="fa-solid fa-pen-to-square" /> {t("dashboard.admin.db.editRow")}
                  </h3>
                  <p className="muted" style={{ marginBottom: "12px" }}>
                    {rowEditModal.table}
                  </p>

                  <div className="db-edit-grid">
                    {Object.entries(rowEditModal.values || {}).map(([key, value]) => (
                      <label key={key} className="mod-field">
                        <span className="mod-field-label">{key}</span>
                        <input
                          className="input"
                          value={value == null ? "" : String(value)}
                          onChange={(event) => updateRowEditField(key, event.target.value)}
                        />
                      </label>
                    ))}
                  </div>

                  <div className="panel-actions" style={{ marginTop: "14px", justifyContent: "flex-end" }}>
                    <button className="button danger" onClick={requestRowDelete}>
                      <i className="fa-solid fa-trash" /> {t("dashboard.admin.db.deleteRow")}
                    </button>
                    <button className="button secondary" onClick={() => setRowEditModal(null)}>
                      {t("dashboard.auth.cancel")}
                    </button>
                    <button className="button" onClick={saveRowEditModal}>
                      <i className="fa-solid fa-floppy-disk" /> {t("dashboard.admin.db.saveRow")}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {rowDeleteConfirm ? (
              <div className="mod-modal-backdrop" role="dialog" aria-modal="true">
                <div className="mod-modal">
                  <h3 className="panel-title" style={{ marginBottom: "8px" }}>
                    <i className="fa-solid fa-triangle-exclamation" /> {t("dashboard.admin.db.confirmDeleteTitle")}
                  </h3>
                  <p className="muted" style={{ marginBottom: "8px" }}>
                    {t("dashboard.admin.db.confirmDeleteBody")}
                  </p>
                  <pre className="console" style={{ maxHeight: "120px", overflow: "auto", marginBottom: "12px" }}>
                    {JSON.stringify(rowDeleteConfirm.where || {}, null, 2)}
                  </pre>
                  <div className="panel-actions" style={{ justifyContent: "flex-end" }}>
                    <button className="button secondary small" onClick={() => setRowDeleteConfirm(null)}>
                      {t("dashboard.auth.cancel")}
                    </button>
                    <button className="button small danger" onClick={confirmRowDelete}>
                      {t("dashboard.admin.db.confirmDeleteAction")}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </Tabs.Content>

          <Tabs.Content value="console" className="tabs-content tabs-content-tight">
            <section className="panel fade-up">
              <div className="panel-header">
                <h2 className="panel-title">
                  <i className="fa-solid fa-terminal" />
                  {t("dashboard.admin.console.title")}
                </h2>
                <div className="panel-actions">
                  <button
                    className="button secondary small"
                    onClick={() => runActionWithConfirm("/api/admin/resume", {
                      title: t("dashboard.admin.console.confirm.startTitle"),
                      message: t("dashboard.admin.console.confirm.startMessage"),
                      confirmLabel: t("dashboard.admin.console.start"),
                      confirmTone: "normal",
                      successMessage: t("dashboard.admin.console.toast.started"),
                    })}
                    disabled={!!actionStatus || !stats?.state?.paused}
                    title={!stats?.state?.paused ? t("dashboard.admin.console.stop") : undefined}
                  >
                    <i className={`fa-solid ${actionStatus === "/api/admin/resume" ? "fa-circle-notch fa-spin" : "fa-play"}`} />
                    {t("dashboard.admin.console.start")}
                  </button>
                  <button
                    className="button secondary small"
                    onClick={() => runActionWithConfirm("/api/admin/pause", {
                      title: t("dashboard.admin.console.confirm.stopTitle"),
                      message: t("dashboard.admin.console.confirm.stopMessage"),
                      confirmLabel: t("dashboard.admin.console.stop"),
                      confirmTone: "danger",
                      successMessage: t("dashboard.admin.console.toast.stopped"),
                    })}
                    disabled={!!actionStatus || stats?.state?.paused === true}
                  >
                    <i className={`fa-solid ${actionStatus === "/api/admin/pause" ? "fa-circle-notch fa-spin" : "fa-stop"}`} />
                    {t("dashboard.admin.console.stop")}
                  </button>
                  <button
                    className="button small"
                    onClick={() => runActionWithConfirm("/api/admin/reload", {
                      title: t("dashboard.admin.console.confirm.restartTitle"),
                      message: t("dashboard.admin.console.confirm.restartMessage"),
                      confirmLabel: t("dashboard.admin.console.restart"),
                      confirmTone: "danger",
                      successMessage: t("dashboard.admin.console.toast.restarted"),
                    })}
                    disabled={!!actionStatus}
                  >
                    <i className={`fa-solid ${actionStatus === "/api/admin/reload" ? "fa-circle-notch fa-spin" : "fa-rotate"}`} />
                    {t("dashboard.admin.console.restart")}
                  </button>
                  <button
                    className="button secondary small"
                    onClick={() => runActionWithConfirm("/api/admin/reload-commands", {
                      title: t("dashboard.admin.console.confirm.reloadCommandsTitle"),
                      message: t("dashboard.admin.console.confirm.reloadCommandsMessage"),
                      confirmLabel: t("dashboard.admin.console.reloadCommands"),
                      confirmTone: "normal",
                      successMessage: t("dashboard.admin.console.toast.commandsReloaded"),
                    })}
                    disabled={!!actionStatus}
                  >
                    <i className={`fa-solid ${actionStatus === "/api/admin/reload-commands" ? "fa-circle-notch fa-spin" : "fa-sitemap"}`} />
                    {t("dashboard.admin.console.reloadCommands")}
                  </button>
                  <button
                    className="button secondary small"
                    onClick={() => runActionWithConfirm("/api/admin/reload-events", {
                      title: t("dashboard.admin.console.confirm.reloadEventsTitle"),
                      message: t("dashboard.admin.console.confirm.reloadEventsMessage"),
                      confirmLabel: t("dashboard.admin.console.reloadEvents"),
                      confirmTone: "normal",
                      successMessage: t("dashboard.admin.console.toast.eventsReloaded"),
                    })}
                    disabled={!!actionStatus}
                  >
                    <i className={`fa-solid ${actionStatus === "/api/admin/reload-events" ? "fa-circle-notch fa-spin" : "fa-bolt"}`} />
                    {t("dashboard.admin.console.reloadEvents")}
                  </button>
                  <button
                    className="button secondary small"
                    onClick={() => runActionWithConfirm("/api/admin/reload-config", {
                      title: t("dashboard.admin.console.confirm.reloadConfigTitle"),
                      message: t("dashboard.admin.console.confirm.reloadConfigMessage"),
                      confirmLabel: t("dashboard.admin.console.reloadConfig"),
                      confirmTone: "normal",
                      successMessage: t("dashboard.admin.console.toast.configReloaded"),
                    })}
                    disabled={!!actionStatus}
                  >
                    <i className={`fa-solid ${actionStatus === "/api/admin/reload-config" ? "fa-circle-notch fa-spin" : "fa-sliders"}`} />
                    {t("dashboard.admin.console.reloadConfig")}
                  </button>
                  <button
                    className="button secondary small"
                    onClick={() => runActionWithConfirm("/api/admin/reload-lang", {
                      title: t("dashboard.admin.console.confirm.reloadLangTitle"),
                      message: t("dashboard.admin.console.confirm.reloadLangMessage"),
                      confirmLabel: t("dashboard.admin.console.reloadLang"),
                      confirmTone: "normal",
                      successMessage: t("dashboard.admin.console.toast.langReloaded"),
                      onSuccess: async () => {
                        reloadI18n();
                      },
                    })}
                    disabled={!!actionStatus}
                  >
                    <i className={`fa-solid ${actionStatus === "/api/admin/reload-lang" ? "fa-circle-notch fa-spin" : "fa-language"}`} />
                    {t("dashboard.admin.console.reloadLang")}
                  </button>
                </div>
              </div>

              <div className="panel-header" style={{ marginTop: "16px" }}>
                <h3 className="panel-title">
                  <i className="fa-solid fa-gauge-high" />
                  {t("dashboard.admin.console.system")}
                </h3>
                <div className="panel-actions">
                  <span className="badge" style={{
                    background: stats?.state?.paused ? "rgba(239,68,68,0.15)" : "rgba(16,185,129,0.15)",
                    color: stats?.state?.paused ? "#ef4444" : "#10b981",
                  }}>
                    <i className={`fa-solid ${stats?.state?.paused ? "fa-circle-pause" : "fa-circle-play"}`} />
                    {" "}{stats?.state?.paused ? t("dashboard.stats.paused") : t("dashboard.stats.running")}
                  </span>
                  <span className="badge" style={{
                    background: "rgba(59,130,246,0.15)",
                    color: "#3b82f6",
                  }}>
                    <i className="fa-solid fa-satellite-dish" /> {pingLabel}
                  </span>
                </div>
              </div>
              <div className="stats-grid stats-grid--4">
                {systemCards.map((card) => (
                  <div key={card.key} className="stat-card fade-up">
                    <div className="stat-header">
                      <span className="stat-icon">
                        <i className={`fa-solid ${card.icon}`} />
                      </span>
                      <div className="stat-label">{card.label}</div>
                    </div>
                    <div className="stat-value">{card.value}</div>
                    {card.subValue ? <div className="stat-subvalue">{card.subValue}</div> : null}
                    {card.chart ? <div className="stat-chart">{card.chart}</div> : null}
                  </div>
                ))}
              </div>
            </section>

            <section className="panel fade-up">
              <div className="panel-header">
                <h3 className="panel-title">
                  <i className="fa-solid fa-terminal" />
                  {t("dashboard.admin.console.logs")}
                  <span className="badge" style={{ marginLeft: "8px" }}>{logs.length}</span>
                </h3>
                <div className="panel-actions">
                  <div className="segmented">
                    {["all", "bot", "dashboard"].map((tab) => (
                      <button
                        key={tab}
                        className={`segmented-button ${consoleLogTab === tab ? "active" : ""}`}
                        onClick={() => setConsoleLogTab(tab)}
                      >
                        {tab === "all" ? t("dashboard.admin.console.tabAll")
                          : tab === "bot" ? t("dashboard.admin.console.tabBot")
                          : t("dashboard.admin.console.tabDashboard")}
                      </button>
                    ))}
                  </div>
                  <button className="button secondary small" onClick={() => setLogs([])}>
                    <i className="fa-solid fa-trash" />
                    {t("dashboard.admin.console.clear")}
                  </button>
                </div>
              </div>
              <div className="console" ref={consoleRef}>
                {(() => {
                  const getSource = (line) => String(line?.source || "bot").toLowerCase();
                  const filtered = consoleLogTab === "all"
                    ? logs
                    : consoleLogTab === "bot"
                      ? logs.filter((l) => {
                          const src = getSource(l);
                          return src === "bot" || src === "runtime";
                        })
                      : logs.filter((l) => {
                          const src = getSource(l);
                          return src !== "bot" && src !== "runtime";
                        });
                  if (filtered.length === 0) {
                    return <div className="console-line muted">{t("dashboard.admin.console.empty")}</div>;
                  }
                  return filtered.map((line, idx) => {
                    const level = (line.level || "log").toLowerCase();
                    const levelClass = level === "error" ? "console-level--error"
                      : level === "warn" ? "console-level--warn"
                      : level === "debug" ? "console-level--debug"
                      : "console-level--info";
                    return (
                      <div key={`${line.timestamp}-${idx}`} className={`console-line ${levelClass}`}>
                        <span className="console-ts">[{line.timestamp}]</span>
                        {" "}
                        <span className={`console-badge console-badge--${level}`}>{level.toUpperCase()}</span>
                        {line.source && line.source !== "bot" ? (
                          <span className="console-badge console-badge--dash">{line.source}</span>
                        ) : null}
                        {" "}
                        <span className="console-msg">{line.message}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </section>
          </Tabs.Content>
        </Tabs.Root>

        {editorMaximized ? (
          <div className="editor-maximized-backdrop">
            <div className="editor-maximized-inner">
              <div className="editor-shell editor-shell--fullscreen">
                <div className="editor-sidebar">
                  <div className="editor-sidebar-files">
                    <div className="panel-header" style={{ marginBottom: "8px" }}>
                      <h3 className="panel-title">
                        <i className={`fa-solid ${editorType === "i18n" ? "fa-folder-open" : "fa-folder"}`} />
                        {t("dashboard.editor.files")}
                      </h3>
                      <span className="badge">
                        {editorType === "i18n" ? localeOptions.length : editorFiles.length}
                      </span>
                    </div>
                    <div className="file-list">
                      {editorType === "i18n"
                        ? localeOptions.map((loc) => (
                            <button
                              key={loc}
                              className={`file-item ${i18nLocale === loc ? "active" : ""}`}
                              onClick={() => setI18nLocale(loc)}
                            >
                              <i className="fa-solid fa-language" />
                              {loc}
                            </button>
                          ))
                        : editorFiles.length === 0
                        ? <div className="muted">{t("dashboard.editor.files")}</div>
                        : editorFiles.map((file) => (
                            <button
                              key={file}
                              className={`file-item ${editorFile === file ? "active" : ""}`}
                              onClick={() => { setEditorFile(file); loadEditorFile(file); }}
                            >
                              <i className={`fa-solid ${editorType === "config" ? "fa-file-lines" : "fa-file-code"}`} />
                              {file}
                            </button>
                          ))
                      }
                    </div>
                  </div>
                </div>

                <div className="editor-main">
                  <div className="editor-header">
                    <div className="editor-file">
                      <i className={`fa-solid ${
                        editorType === "i18n" ? "fa-language"
                        : editorType === "config" ? "fa-file-lines"
                        : "fa-file-code"
                      }`} />
                      {editorType === "i18n"
                        ? (i18nLocale || t("dashboard.admin.i18n.title"))
                        : (editorFile || t("dashboard.editor.files"))
                      }
                    </div>
                    <div className="panel-actions">
                      {editorType === "i18n" ? (
                        <>
                          <button
                            className="button secondary small"
                            onClick={loadLocale}
                            disabled={!i18nLocale || localeLoading}
                          >
                            <i className={`fa-solid ${localeLoading ? "fa-circle-notch fa-spin" : "fa-rotate"}`} />
                            {t("dashboard.admin.i18n.load")}
                          </button>
                          <button className="button small" onClick={saveLocale}>
                            <i className="fa-solid fa-floppy-disk" />
                            {t("dashboard.admin.i18n.save")}
                          </button>
                          <button
                            className="button secondary small"
                            onClick={formatEditorDocument}
                          >
                            <i className="fa-solid fa-wand-magic-sparkles" />
                            {t("dashboard.editor.format")}
                          </button>
                          <button
                            className="button secondary small"
                            onClick={openDiffPreview}
                          >
                            <i className="fa-solid fa-code-compare" />
                            {t("dashboard.editor.diff")}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="button secondary small"
                            onClick={() => loadEditorFile()}
                            disabled={!editorFile || editorLoading}
                          >
                            <i className={`fa-solid ${editorLoading ? "fa-circle-notch fa-spin" : "fa-rotate"}`} />
                            {t("dashboard.editor.load")}
                          </button>
                          {editorType !== "config" ? (
                            <button
                              className="button secondary small"
                              onClick={() => setShowNewFileModal(true)}
                            >
                              <i className="fa-solid fa-plus" />
                              {t("dashboard.editor.create")}
                            </button>
                          ) : null}
                          <button
                            className="button small"
                            onClick={saveEditorFile}
                            disabled={!editorFile}
                          >
                            <i className="fa-solid fa-floppy-disk" />
                            {t("dashboard.editor.save")}
                          </button>
                          <button
                            className="button secondary small"
                            onClick={formatEditorDocument}
                          >
                            <i className="fa-solid fa-wand-magic-sparkles" />
                            {t("dashboard.editor.format")}
                          </button>
                          <button
                            className="button secondary small"
                            onClick={openDiffPreview}
                          >
                            <i className="fa-solid fa-code-compare" />
                            {t("dashboard.editor.diff")}
                          </button>
                        </>
                      )}
                      <button
                        className="button secondary small"
                        onClick={() => setEditorMaximized(false)}
                        title={t("dashboard.editor.restore")}
                      >
                        <i className="fa-solid fa-compress" />
                      </button>
                    </div>
                  </div>
                  <CodeEditor
                    value={editorType === "i18n" ? i18nText : editorContent}
                    onChange={editorType === "i18n" ? setI18nText : setEditorContent}
                    language={editorType === "i18n" || editorType === "config" ? "json" : "javascript"}
                    minHeight={400}
                  />
                  {editorMessage && editorType !== "i18n" ? <p className="muted">{editorMessage}</p> : null}
                  {i18nMessage && editorType === "i18n" ? <p className="muted">{i18nMessage}</p> : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {showDiffModal ? (
          <div className="mod-modal-backdrop" role="dialog" aria-modal="true">
            <div className="mod-modal mod-modal-lg">
              <h3 className="panel-title" style={{ marginBottom: "8px" }}>
                <i className="fa-solid fa-code-compare" /> {t("dashboard.editor.diffTitle")}
              </h3>
              <p className="muted" style={{ marginBottom: "12px" }}>
                {t("dashboard.editor.diffHint")}
              </p>

              <div className="diff-suggestions">
                {diffSuggestions.length === 0 ? (
                  <div className="muted">{t("dashboard.editor.diffEmpty")}</div>
                ) : (
                  diffSuggestions.map((item, index) => (
                    <div
                      key={`${item.kind}-${item.line}-${index}`}
                      className={`diff-line ${item.kind}`}
                    >
                      <span className="diff-line-no">{item.line}</span>
                      <span className="diff-line-sign">{item.kind === "added" ? "+" : "-"}</span>
                      <span className="diff-line-text">{item.text || " "}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="panel-actions" style={{ justifyContent: "flex-end", marginTop: "14px" }}>
                <button
                  className="button secondary small"
                  onClick={() => setShowDiffModal(false)}
                >
                  {t("dashboard.auth.cancel")}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showNewFileModal ? (
          <div className="mod-modal-backdrop" role="dialog" aria-modal="true">
            <div className="mod-modal">
              <h3 className="panel-title" style={{ marginBottom: "8px" }}>
                <i className="fa-solid fa-file-circle-plus" /> {t("dashboard.editor.create")}
              </h3>
              <p className="muted" style={{ marginBottom: "12px" }}>
                {t("dashboard.editor.path")}
              </p>
              <div className="mod-confirm-form">
                <input
                  className="input"
                  value={newFilePath}
                  onChange={(event) => setNewFilePath(event.target.value)}
                  placeholder={t("dashboard.editor.pathPlaceholder")}
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      createEditorFile();
                      setShowNewFileModal(false);
                    }
                    if (event.key === "Escape") setShowNewFileModal(false);
                  }}
                />
              </div>
              <div className="panel-actions" style={{ justifyContent: "flex-end", marginTop: "14px" }}>
                <button
                  className="button secondary small"
                  onClick={() => {
                    setShowNewFileModal(false);
                    setNewFilePath("");
                  }}
                >
                  {t("dashboard.auth.cancel")}
                </button>
                <button
                  className="button small"
                  onClick={() => {
                    createEditorFile();
                    setShowNewFileModal(false);
                  }}
                  disabled={!newFilePath}
                >
                  <i className="fa-solid fa-plus" />
                  {t("dashboard.editor.create")}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {consoleConfirm ? (
          <div className="mod-modal-backdrop" role="dialog" aria-modal="true">
            <div className="mod-modal">
              <h3 className="panel-title" style={{ marginBottom: "8px" }}>
                <i className="fa-solid fa-terminal" /> {consoleConfirm.title}
              </h3>
              <p className="muted" style={{ marginBottom: "14px" }}>{consoleConfirm.message}</p>
              <div className="panel-actions" style={{ justifyContent: "flex-end" }}>
                <button className="button secondary small" onClick={() => setConsoleConfirm(null)}>
                  {t("dashboard.auth.cancel")}
                </button>
                <button
                  className={`button small ${consoleConfirm.confirmTone === "danger" ? "danger" : ""}`}
                  onClick={confirmConsoleAction}
                >
                  {consoleConfirm.confirmLabel || t("dashboard.admin.console.confirm.confirm")}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {modConfirm ? (
          <div className="mod-modal-backdrop" role="dialog" aria-modal="true">
            <div className="mod-modal">
              <h3 className="panel-title" style={{ marginBottom: "8px" }}>
                <i className="fa-solid fa-shield-halved" /> {modConfirm.title}
              </h3>
              <p className="muted">{modConfirm.message}</p>
              {modConfirm.kind === "action" ? (
                <div className="mod-confirm-form">
                  <div className="mod-confirm-target">
                    <span className="mod-confirm-label">{t("dashboard.admin.moderation.modal.targetUser")}</span>
                    <strong>{modConfirm.targetName || modSelectedUserId}</strong>
                  </div>
                  {modConfirm.action !== "unmute" ? (
                    <label className="mod-field">
                      <span className="mod-field-label">{t("dashboard.admin.moderation.modal.reason")}</span>
                      <input
                        className="input"
                        value={modConfirm.reason || ""}
                        onChange={(event) => updateModConfirmField("reason", event.target.value)}
                        placeholder={t("dashboard.admin.moderation.modal.reasonPlaceholder")}
                      />
                    </label>
                  ) : null}
                  {modConfirm.action === "mute" ? (
                    <label className="mod-field">
                      <span className="mod-field-label">{t("dashboard.admin.moderation.modal.muteDuration")}</span>
                      <input
                        className="input"
                        value={modConfirm.durationMinutes || ""}
                        onChange={(event) => updateModConfirmField("durationMinutes", event.target.value)}
                        placeholder={t("dashboard.admin.moderation.modal.muteDurationPlaceholder")}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
              {modConfirm.kind === "user-message" ? (
                <div className="mod-confirm-form">
                  <div className="mod-confirm-target">
                    <span className="mod-confirm-label">{t("dashboard.admin.moderation.modal.targetUser")}</span>
                    <strong>{modConfirm.targetName || modSelectedUserId}</strong>
                  </div>
                  <label className="mod-field">
                    <span className="mod-field-label">{t("dashboard.admin.moderation.modal.message")}</span>
                    <input
                      className="input"
                      value={modConfirm.messageText || ""}
                      onChange={(event) => updateModConfirmField("messageText", event.target.value)}
                      placeholder={t("dashboard.admin.moderation.modal.messagePlaceholder")}
                    />
                  </label>
                </div>
              ) : null}
              <div className="panel-actions" style={{ justifyContent: "flex-end", marginTop: "14px" }}>
                <button className="button secondary small" onClick={() => setModConfirm(null)}>
                  {t("dashboard.auth.cancel")}
                </button>
                <button
                  className={`button small ${modConfirm.confirmTone === "danger" ? "danger" : ""}`}
                  onClick={confirmModerationDialog}
                >
                  {modConfirm.confirmLabel || t("dashboard.admin.moderation.modal.confirm")}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <ToastStack
          toasts={toasts}
          onClose={dismissToast}
          closeAriaLabel={t("dashboard.admin.moderation.toast.close")}
        />

        <Footer />
      </main>
    </AuthGate>
  );
}
