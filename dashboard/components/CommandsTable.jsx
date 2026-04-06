"use client";

import { useEffect, useMemo, useState } from "react";
import { formatSeconds } from "../lib/format";

export default function CommandsTable({
  commands,
  prefix,
  search,
  onSearch,
  t,
}) {
  const [copied, setCopied] = useState("");
  const [activeRole, setActiveRole] = useState("all");
  const empty = t("dashboard.stats.empty");
  const roleOrder = [
    "user",
    "resident_dj",
    "bouncer",
    "manager",
    "cohost",
    "host",
  ];
  const roleIcons = {
    user: "fa-user",
    resident_dj: "fa-headphones",
    bouncer: "fa-shield",
    manager: "fa-clipboard",
    cohost: "fa-user-group",
    host: "fa-crown",
  };

  const grouped = useMemo(() => {
    const term = String(search || "").trim().toLowerCase();
    const list = term
      ? commands.filter((cmd) => {
          const haystack = [
            cmd.name,
            cmd.category,
            cmd.description,
            cmd.usage,
            ...(cmd.aliases || []),
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(term);
        })
      : commands;

    const map = new Map();
    for (const cmd of list) {
      const role = cmd.minRole || "user";
      if (!map.has(role)) map.set(role, []);
      map.get(role).push(cmd);
    }

    const extraRoles = [...map.keys()].filter((role) =>
      !roleOrder.includes(role),
    );
    const orderedRoles = [...roleOrder, ...extraRoles].filter((role) =>
      map.has(role),
    );

    return { map, orderedRoles, count: list.length };
  }, [commands, search]);

  useEffect(() => {
    if (activeRole !== "all" && !grouped.orderedRoles.includes(activeRole)) {
      setActiveRole("all");
    }
  }, [activeRole, grouped.orderedRoles]);

  const visibleRoles =
    activeRole === "all"
      ? grouped.orderedRoles
      : grouped.orderedRoles.filter((role) => role === activeRole);
  const showRoleColumn = true;

  const formatRole = (role) =>
    String(role || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());

  const handleCopy = async (value, id) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setCopied("");
    }
  };

  return (
    <div>
      <div className="search-row">
        <div className="search-input">
          <i className="fa-solid fa-magnifying-glass" />
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={t("dashboard.commands.searchPlaceholder")}
          />
        </div>
        <div className="role-tabs">
          <button
            className={`role-tab ${activeRole === "all" ? "active" : ""}`}
            onClick={() => setActiveRole("all")}
          >
            <i className="fa-solid fa-layer-group" />
            {t("dashboard.commands.title")}
            <span className="badge">{grouped.count}</span>
          </button>
          {grouped.orderedRoles.map((role) => (
            <button
              key={role}
              className={`role-tab ${activeRole === role ? "active" : ""}`}
              onClick={() => setActiveRole(role)}
            >
              <i className={`fa-solid ${roleIcons[role] || "fa-user"}`} />
              {formatRole(role)}
              <span className="badge">{grouped.map.get(role).length}</span>
            </button>
          ))}
        </div>
      </div>

      {grouped.count === 0 ? (
        <div style={{ marginTop: "18px" }}>
          {t("dashboard.commands.noResults")}
        </div>
      ) : null}

      {visibleRoles.map((role) => (
        <div key={role} style={{ marginTop: "18px" }}>
          <div className="panel-header" style={{ marginBottom: "12px" }}>
            <h3 className="panel-title">
              <i className={`fa-solid ${roleIcons[role] || "fa-user"}`} />
              {formatRole(role)}
            </h3>
            <span className="badge">{grouped.map.get(role).length}</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("dashboard.commands.category")}</th>
                  <th>{t("dashboard.commands.command")}</th>
                  <th>{t("dashboard.commands.aliases")}</th>
                  <th>{t("dashboard.commands.description")}</th>
                  <th>{t("dashboard.commands.usage")}</th>
                  <th>{t("dashboard.commands.cooldown")}</th>
                  <th>{t("dashboard.commands.minRole")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {grouped.map.get(role).map((cmd) => {
                  const commandText = `${prefix}${cmd.name}`;
                  const usageText = cmd.usage || commandText;
                  const isCopied = copied === cmd.name;
                  const isUsageCopied = copied === `${cmd.name}-usage`;
                  const aliasText = cmd.aliases?.length
                    ? cmd.aliases.map((a) => `${prefix}${a}`).join(", ")
                    : empty;
                  return (
                    <tr key={cmd.name}>
                      <td>
                        <span className="tag">{cmd.category}</span>
                      </td>
                      <td>
                        <strong>{commandText}</strong>
                      </td>
                      <td>{aliasText}</td>
                      <td>{cmd.description || empty}</td>
                      <td>{cmd.usage || empty}</td>
                      <td>{cmd.cooldownMs ? formatSeconds(cmd.cooldownMs) : empty}</td>
                      <td>
                        <span
                          className="role-pill"
                          data-role={cmd.minRole || "user"}
                        >
                          {formatRole(cmd.minRole || "user")}
                        </span>
                      </td>
                      <td>
                        <div className="command-actions">
                          <button
                            className="button secondary small"
                            data-state={isCopied ? "copied" : ""}
                            onClick={() => handleCopy(commandText, cmd.name)}
                          >
                            <i
                              className={`fa-solid ${
                                isCopied ? "fa-check" : "fa-copy"
                              }`}
                            />
                            {isCopied
                              ? t("dashboard.commands.copied")
                              : t("dashboard.commands.copy")}
                          </button>
                          {cmd.usage ? (
                            <button
                              className="button ghost small"
                              data-state={isUsageCopied ? "copied" : ""}
                              onClick={() =>
                                handleCopy(usageText, `${cmd.name}-usage`)
                              }
                            >
                              <i
                                className={`fa-solid ${
                                  isUsageCopied ? "fa-check" : "fa-clipboard"
                                }`}
                              />
                              {isUsageCopied
                                ? t("dashboard.commands.copied")
                                : t("dashboard.commands.copyUsage")}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
