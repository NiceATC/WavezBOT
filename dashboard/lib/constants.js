export const API_BASE = "/api/bot";

export const WS_BASE =
  process.env.NEXT_PUBLIC_DASHBOARD_WS || "ws://localhost:3100";

export function buildApiUrl(path = "") {
  if (path.startsWith("http")) return path;
  const trimmed = path.startsWith("/api/") ? path.slice(4) : path;
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${API_BASE}${normalized}`;
}
