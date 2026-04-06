export function pickRandom(list) {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  return list[Math.floor(Math.random() * list.length)];
}
