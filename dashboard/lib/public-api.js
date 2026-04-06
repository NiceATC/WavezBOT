import { buildApiUrl } from "./constants";

export async function publicFetch(path, options = {}) {
  const res = await fetch(buildApiUrl(path), options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    const code = data?.error || "unknown";
    const err = new Error(code);
    err.code = code;
    throw err;
  }
  return data;
}
