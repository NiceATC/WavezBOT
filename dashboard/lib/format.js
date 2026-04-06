export function formatDuration(totalSec) {
  const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  if (minutes || hours || days) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

export function formatReactions(reactions) {
  return {
    woots: Number(reactions?.woots ?? 0),
    mehs: Number(reactions?.mehs ?? 0),
    grabs: Number(reactions?.grabs ?? 0),
  };
}

export function formatBytes(value) {
  const size = Math.max(0, Number(value) || 0);
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let idx = -1;
  let scaled = size;
  while (scaled >= 1024 && idx < units.length - 1) {
    scaled /= 1024;
    idx += 1;
  }
  return `${scaled.toFixed(scaled >= 100 ? 0 : 1)} ${units[idx]}`;
}

export function formatRate(bytesPerSec) {
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatSeconds(ms) {
  const total = Number(ms) || 0;
  const seconds = total / 1000;
  const formatted = Number.isInteger(seconds)
    ? seconds.toString()
    : seconds.toFixed(1);
  return `${formatted}s`;
}

export function formatNumber(value, locale, options = {}) {
  const num = Number(value) || 0;
  try {
    return new Intl.NumberFormat(locale || "en-US", options).format(num);
  } catch {
    return String(num);
  }
}

export function formatPoints(value, locale) {
  const amount = Number(value) / 100;
  return formatNumber(amount, locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
