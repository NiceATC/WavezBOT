import { formatDuration, formatReactions } from "../lib/format";

export default function StatsGrid({ stats, t, loading = false }) {
  const isLoading = loading || !stats;

  if (isLoading) {
    const placeholders = Array.from({ length: 9 }, (_, index) => {
      const isWide = index === 5;
      const stagger = `stagger-${(index % 3) + 1}`;
      return (
        <div
          key={`skeleton-${index}`}
          className={`stat-card stat-card--skeleton fade-up ${stagger} ${
            isWide ? "stat-card--wide" : ""
          }`}
        >
          <div className="stat-header">
            <span className="stat-icon skeleton skeleton-icon" />
            <div className="stat-label skeleton skeleton-text" />
          </div>
          <div className="stat-value">
            <div className="skeleton skeleton-line" />
          </div>
        </div>
      );
    });

    return <div className="stats-grid stats-grid--layout">{placeholders}</div>;
  }

  const state = stats?.state || {};
  const empty = t("dashboard.stats.empty");
  const uptime =
    state.uptimeSec != null ? formatDuration(state.uptimeSec) : empty;
  const users =
    state.roomUserCount != null ? String(state.roomUserCount) : empty;
  const track = state.currentTrack?.title || empty;
  const dj = state.djName || empty;
  const reactions = formatReactions(state.currentTrackReactions || {});
  const nextDj = state.nextDjName || empty;
  const commandsLoaded =
    state.commandsLoaded != null ? String(state.commandsLoaded) : empty;
  const eventsLoaded =
    state.eventsLoaded != null ? String(state.eventsLoaded) : empty;
  const statusLabel = state.paused
    ? t("dashboard.stats.paused")
    : t("dashboard.stats.running");

  const reactionNode = (
    <div className="reaction-row">
      <span className="reaction-item">
        <i className="fa-solid fa-thumbs-up" /> {reactions.woots}
      </span>
      <span className="reaction-item">
        <i className="fa-solid fa-thumbs-down" /> {reactions.mehs}
      </span>
      <span className="reaction-item">
        <i className="fa-solid fa-plus" /> {reactions.grabs}
      </span>
    </div>
  );

  const cards = [
    {
      key: "status",
      label: t("dashboard.stats.status"),
      value: statusLabel,
      icon: "fa-power-off",
    },
    {
      key: "uptime",
      label: t("dashboard.stats.uptime"),
      value: uptime,
      icon: "fa-clock",
    },
    {
      key: "users",
      label: t("dashboard.stats.usersOnline"),
      value: users,
      icon: "fa-users",
    },
    {
      key: "commands",
      label: t("dashboard.stats.commandsLoaded"),
      value: commandsLoaded,
      icon: "fa-code",
    },
    {
      key: "events",
      label: t("dashboard.stats.eventsLoaded"),
      value: eventsLoaded,
      icon: "fa-bolt",
    },
    {
      key: "track",
      label: t("dashboard.stats.currentTrack"),
      value: track,
      icon: "fa-music",
      wide: true,
      valueClassName: "stat-value--track",
    },
    {
      key: "reactions",
      label: t("dashboard.stats.reactions"),
      node: reactionNode,
      icon: "fa-heart",
    },
    {
      key: "dj",
      label: t("dashboard.stats.dj"),
      value: dj,
      icon: "fa-headphones",
    },
    {
      key: "next",
      label: t("dashboard.stats.nextDj"),
      value: nextDj,
      icon: "fa-forward",
    },
  ];

  return (
    <div className="stats-grid stats-grid--layout">
      {cards.map((card, index) => {
        const stagger = `stagger-${(index % 3) + 1}`;
        return (
          <div
            key={card.key}
            className={`stat-card fade-up ${stagger} ${
              card.wide ? "stat-card--wide" : ""
            }`}
          >
            <div className="stat-header">
              <span className="stat-icon">
                <i className={`fa-solid ${card.icon}`} />
              </span>
              <div className="stat-label">{card.label}</div>
            </div>
            <div className={`stat-value ${card.valueClassName || ""}`.trim()}>
              {card.node ?? card.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
