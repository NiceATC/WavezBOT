"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { publicFetch } from "./public-api";

const DEFAULT_THEME = {
  bg: "#f4f1ea",
  surface: "#ffffff",
  surfaceStrong: "#ffffff",
  ink: "#1c2028",
  muted: "#6b7280",
  accent: "#ff5d3a",
  accent2: "#0ea5a3",
  accent3: "#f59e0b",
  accent4: "#2563eb",
  stroke: "rgba(28, 32, 40, 0.12)",
};

const THEME_VARS = {
  bg: "--bg",
  surface: "--surface",
  surfaceStrong: "--surface-strong",
  ink: "--ink",
  muted: "--muted",
  accent: "--accent",
  accent2: "--accent-2",
  accent3: "--accent-3",
  accent4: "--accent-4",
  stroke: "--stroke",
};

const RGB_VARS = {
  accent: "--accent-rgb",
  accent2: "--accent-2-rgb",
  accent3: "--accent-3-rgb",
  accent4: "--accent-4-rgb",
  ink: "--ink-rgb",
};

function toRgbString(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("#")) {
    const hex = raw.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return `${r}, ${g}, ${b}`;
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `${r}, ${g}, ${b}`;
    }
  }
  const rgbMatch = raw.match(/rgba?\(([^)]+)\)/i);
  if (rgbMatch) {
    const parts = rgbMatch[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (parts.length === 3) return parts.join(", ");
  }
  return "";
}

function applyTheme(theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  Object.entries(THEME_VARS).forEach(([key, cssVar]) => {
    const value = theme?.[key];
    if (value) root.style.setProperty(cssVar, value);
  });
  Object.entries(RGB_VARS).forEach(([key, cssVar]) => {
    const value = toRgbString(theme?.[key]);
    if (value) root.style.setProperty(cssVar, value);
  });
}

const ThemeContext = createContext({
  theme: DEFAULT_THEME,
  setTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(DEFAULT_THEME);

  useEffect(() => {
    let active = true;
    publicFetch("/api/session")
      .then((data) => {
        if (!active) return;
        const next = {
          ...DEFAULT_THEME,
          ...(data?.config?.dashboardTheme || {}),
        };
        setThemeState(next);
        applyTheme(next);
      })
      .catch(() => {
        applyTheme(DEFAULT_THEME);
      });
    return () => {
      active = false;
    };
  }, []);

  const setTheme = (next) => {
    const merged = { ...DEFAULT_THEME, ...(next || {}) };
    setThemeState(merged);
    applyTheme(merged);
  };

  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function getDefaultTheme() {
  return { ...DEFAULT_THEME };
}
