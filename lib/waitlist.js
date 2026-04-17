export function getQueueEntryUserId(entry) {
  if (entry == null) return null;
  if (typeof entry === "string" || typeof entry === "number") {
    return String(entry);
  }

  const userId =
    entry?.internalId ?? entry?.userId ?? entry?.user_id ?? entry?.id ?? null;
  return userId != null ? String(userId) : null;
}

export function getQueueIncludesCurrentDj(entries, options = {}) {
  if (!Array.isArray(entries) || entries.length === 0) return false;

  const first = entries[0];
  if (first?.isCurrentDj === true) return true;

  const currentDjId =
    options.currentDjId != null ? String(options.currentDjId) : null;
  if (!currentDjId) return false;

  return getQueueEntryUserId(first) === currentDjId;
}

export function getWaitlistOffset(entries, options = {}) {
  return getQueueIncludesCurrentDj(entries, options) ? 1 : 0;
}

export function getWaitlistTotal(entries, options = {}) {
  if (!Array.isArray(entries)) return 0;
  return Math.max(0, entries.length - getWaitlistOffset(entries, options));
}

export function getWaitlistPositionForIndex(index, entries, options = {}) {
  const rawIndex = Math.trunc(Number(index));
  if (!Number.isFinite(rawIndex) || rawIndex < 0) return null;

  const position = rawIndex + 1 - getWaitlistOffset(entries, options);
  return position >= 1 ? position : null;
}

export function getNextDjEntry(entries, options = {}) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const nextIndex = getWaitlistOffset(entries, options);
  return entries[nextIndex] ?? null;
}
