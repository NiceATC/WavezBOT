const DEFAULT_MAX_LEN = 350;

function normalizeText(text) {
  if (text == null) return "";
  return String(text).replace(/\s+/g, " ").trim();
}

export function ensureMention(name) {
  const value = normalizeText(name);
  if (!value) return "";
  return value.startsWith("@") ? value : `@${value}`;
}

export function splitChatMessage(text, maxLen = DEFAULT_MAX_LEN) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const limit = Math.max(50, Number(maxLen) || DEFAULT_MAX_LEN);
  if (normalized.length <= limit) return [normalized];

  const chunks = [];
  let remaining = normalized;

  while (remaining.length > limit) {
    const slice = remaining.slice(0, limit + 1);
    let cut = slice.lastIndexOf(" ");
    if (cut < Math.floor(limit * 0.6)) cut = limit;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

export async function sendChatChunks(sendFn, text, maxLen = DEFAULT_MAX_LEN) {
  const chunks = splitChatMessage(text, maxLen);
  for (const chunk of chunks) {
    if (chunk) await sendFn(chunk);
  }
  return chunks.length;
}

export function sendChatSequence(sendFn, lines, delayMs = 1200) {
  if (typeof sendFn !== "function") return 0;
  if (!Array.isArray(lines) || lines.length === 0) return 0;

  const delay = Math.max(0, Number(delayMs) || 0);
  let count = 0;
  lines.forEach((line, index) => {
    const text = normalizeText(line);
    if (!text) return;
    count += 1;
    setTimeout(() => {
      sendFn(text).catch(() => {});
    }, delay * index);
  });

  return count;
}
