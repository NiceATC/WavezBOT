"use client";

import { createContext, useContext, useMemo, useState, useEffect } from "react";
import { buildApiUrl } from "./constants";

const SESSION_MARKER = "session";
const REMEMBER_KEY = "dashboard-remember";
const REMEMBER_DAYS = 30;

const AuthContext = createContext({
  token: "",
  login: async () => {},
  logout: () => {},
  apiFetch: async () => ({}),
  status: "idle",
  errorCode: "",
  clearError: () => {},
  turnstileRequired: false,
  turnstileSiteKey: "",
});

export function AuthProvider({ children }) {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("checking");
  const [errorCode, setErrorCode] = useState("");
  const [turnstileRequired, setTurnstileRequired] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("");

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      try {
        const res = await fetch(buildApiUrl("/api/session"), {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (data?.turnstileRequired !== undefined) {
          setTurnstileRequired(Boolean(data.turnstileRequired));
          setTurnstileSiteKey(String(data.turnstileSiteKey ?? "").trim());
        }
        if (res.ok && data?.ok !== false) {
          setToken(SESSION_MARKER);
        } else {
          setToken("");
        }
      } catch {
        if (active) setToken("");
      } finally {
        if (active) setStatus("idle");
      }
    };

    checkSession();
    return () => {
      active = false;
    };
  }, []);

  const login = async (password, options = {}) => {
    setStatus("loading");
    setErrorCode("");
    try {
      const turnstileToken = String(options?.turnstileToken ?? "").trim();
      const res = await fetch(buildApiUrl("/api/auth/login"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password, turnstileToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setErrorCode(data?.error || "unknown");
        setStatus("idle");
        return false;
      }
      setToken(SESSION_MARKER);
      if (options?.remember) {
        try {
          const expiry = Date.now() + REMEMBER_DAYS * 24 * 60 * 60 * 1000;
          window.localStorage.setItem(REMEMBER_KEY, String(expiry));
        } catch {
          /* ignore */
        }
      } else {
        try {
          window.localStorage.removeItem(REMEMBER_KEY);
        } catch {
          /* ignore */
        }
      }
      setStatus("idle");
      return true;
    } catch {
      setErrorCode("network");
      setStatus("idle");
      return false;
    }
  };

  const logout = async () => {
    try {
      await fetch(buildApiUrl("/api/auth/logout"), {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    }
    setToken("");
  };

  const clearError = () => setErrorCode("");

  const apiFetch = async (path, options = {}) => {
    const headers = { ...(options.headers || {}) };
    const res = await fetch(buildApiUrl(path), {
      ...options,
      credentials: "include",
      headers,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      const code = data?.error || "unknown";
      if (res.status === 401) {
        setToken("");
      }
      const err = new Error(code);
      err.code = code;
      throw err;
    }
    return data;
  };

  const value = useMemo(
    () => ({
      token,
      login,
      logout,
      apiFetch,
      status,
      errorCode,
      clearError,
      turnstileRequired,
      turnstileSiteKey,
    }),
    [token, status, errorCode, turnstileRequired, turnstileSiteKey],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
