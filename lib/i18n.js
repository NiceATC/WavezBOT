import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const LOCALES_DIR = path.join(ROOT, "locales");

export const DEFAULT_LOCALE = "pt-BR";
export const SUPPORTED_LOCALES = ["pt-BR", "en-US"];

const LOCALE_ALIASES = {
  pt: "pt-BR",
  "pt-br": "pt-BR",
  pt_br: "pt-BR",
  en: "en-US",
  "en-us": "en-US",
  en_us: "en-US",
};

const cache = new Map();

export function normalizeLocale(input) {
  if (!input) return DEFAULT_LOCALE;
  const raw = String(input).trim();
  if (!raw) return DEFAULT_LOCALE;
  const lower = raw.toLowerCase();
  const mapped = LOCALE_ALIASES[lower] ?? raw;
  return SUPPORTED_LOCALES.includes(mapped) ? mapped : DEFAULT_LOCALE;
}

function loadLocale(locale) {
  const normalized = normalizeLocale(locale);
  if (cache.has(normalized)) return cache.get(normalized);
  const file = path.join(LOCALES_DIR, `${normalized}.json`);
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    data = {};
  }
  cache.set(normalized, data);
  return data;
}

export function getLocaleFilePath(locale) {
  const normalized = normalizeLocale(locale);
  return path.join(LOCALES_DIR, `${normalized}.json`);
}

export function getLocaleData(locale) {
  return loadLocale(locale);
}

export function invalidateLocaleCache(locale) {
  if (!locale) {
    cache.clear();
    return;
  }
  const normalized = normalizeLocale(locale);
  cache.delete(normalized);
}

function getByPath(obj, key) {
  if (!obj || !key) return undefined;
  const parts = String(key).split(".");
  let cur = obj;
  for (const part of parts) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, part)) {
      cur = cur[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

function formatMessage(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const val = vars[key];
    return val == null ? match : String(val);
  });
}

export function getMessage(key, locale) {
  const loc = normalizeLocale(locale);
  const primary = getByPath(loadLocale(loc), key);
  if (primary !== undefined) return primary;
  if (loc !== DEFAULT_LOCALE) {
    return getByPath(loadLocale(DEFAULT_LOCALE), key);
  }
  return undefined;
}

export function t(key, vars, locale) {
  const msg = getMessage(key, locale);
  if (msg == null) return key;
  if (typeof msg !== "string") return String(msg);
  return formatMessage(msg, vars);
}

export function tArray(key, locale) {
  const msg = getMessage(key, locale);
  return Array.isArray(msg) ? msg : [];
}

export function resolveLocalizedValue(value, locale) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const loc = normalizeLocale(locale);
    return (
      value[loc] ?? value[DEFAULT_LOCALE] ?? value[Object.keys(value)[0]] ?? ""
    );
  }
  return value;
}
