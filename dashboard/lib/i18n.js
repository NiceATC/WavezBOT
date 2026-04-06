"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { buildApiUrl } from "./constants";

const I18nContext = createContext({
  locale: "en-US",
  locales: [],
  setLocale: () => {},
  t: (key) => key,
  ready: false,
});

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

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState("en-US");
  const [locales, setLocales] = useState([]);
  const [strings, setStrings] = useState({});
  const [ready, setReady] = useState(false);

  const detectBrowserLocale = (list) => {
    if (typeof navigator === "undefined") return null;
    const candidates = Array.isArray(navigator.languages)
      ? navigator.languages
      : [navigator.language];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const normalized = candidate.replace("_", "-");
      if (list.includes(normalized)) return normalized;
      const base = normalized.split("-")[0];
      const partial = list.find((loc) => loc.startsWith(base));
      if (partial) return partial;
    }
    return null;
  };

  useEffect(() => {
    let active = true;
    fetch(buildApiUrl("/api/locales"))
      .then((res) => res.json())
      .then((data) => {
        if (!active || !data?.ok) return;
        const list = Array.isArray(data.locales) ? data.locales : [];
        setLocales(list);
        const stored = window.localStorage.getItem("dashboard-locale");
        const preferred = stored && list.includes(stored) ? stored : null;
        const detected = detectBrowserLocale(list);
        const fallback = data.currentLocale || data.defaultLocale || "en-US";
        setLocale(preferred || detected || fallback);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!locale) return;
    let active = true;
    setReady(false);
    fetch(buildApiUrl(`/api/locales/${encodeURIComponent(locale)}`))
      .then((res) => res.json())
      .then((data) => {
        if (!active || !data?.ok) return;
        setStrings(data.data || {});
        setReady(true);
        window.localStorage.setItem("dashboard-locale", locale);
      })
      .catch(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [locale]);

  const t = useMemo(
    () =>
      (key, fallback = key) => {
        const value = getByPath(strings, key);
        if (value == null) return fallback;
        if (typeof value === "string" || typeof value === "number") {
          return String(value);
        }
        return fallback;
      },
    [strings],
  );

  const value = useMemo(
    () => ({ locale, locales, setLocale, t, ready }),
    [locale, locales, t, ready],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
