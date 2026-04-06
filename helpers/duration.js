function parseDuration(tok) {
  const m = tok.match(/^(h|d)?(\d+)$/i);
  if (!m) return null;
  const unit = (m[1] || "").toLowerCase();
  const val = parseInt(m[2], 10);
  if (unit === "h") return { minutes: val * 60, label: `${val}h` };
  if (unit === "d") return { minutes: val * 1440, label: `${val}d` };
  return { minutes: val, label: `${val}min` };
}

export function extractDurationAndReason(tokens) {
  let duration = null;
  let label = null;
  const reasonParts = [];

  for (const tok of tokens) {
    if (duration === null) {
      const d = parseDuration(tok);
      if (d) {
        duration = d.minutes;
        label = d.label;
        continue;
      }
    }
    reasonParts.push(tok);
  }

  return { duration, label, reason: reasonParts.join(" ") || null };
}
