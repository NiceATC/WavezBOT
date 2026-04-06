export function isServerDownError(err) {
  const msg = String(err?.message ?? "");
  const lower = msg.toLowerCase();
  if (lower.includes("502")) return true;
  if (/bad gateway/i.test(msg)) return true;
  if (/<!doctype html/i.test(msg) && /cloudflare|wavez/i.test(msg)) {
    return true;
  }
  if (/<!doctype html/i.test(msg) && /forbidden|access denied/i.test(msg)) {
    return true;
  }
  return false;
}
