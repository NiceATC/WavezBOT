export const POINT_SCALE = 100;

export function toPointsInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * POINT_SCALE);
}

export function formatPoints(valueInt) {
  const num = Number(valueInt) || 0;
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  const whole = Math.floor(abs / POINT_SCALE);
  const frac = abs % POINT_SCALE;
  if (frac === 0) return `${sign}${whole}`;
  const text = (abs / POINT_SCALE)
    .toFixed(2)
    .replace(/\.00$/, "")
    .replace(/(\.\d)0$/, "$1");
  return `${sign}${text}`;
}
