"use client";

import { createContext, useContext, useMemo, useState, useEffect } from "react";
import { buildApiUrl } from "./constants";

const AuthContext = createContext({
  token: "",
  login: async () => {},
  logout: () => {},
  apiFetch: async () => ({}),
  status: "idle",
  errorCode: "",
  clearError: () => {},
});

export function AuthProvider({ children }) {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("idle");
  const [errorCode, setErrorCode] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem("dashboard-token");
    if (!stored) return;
    const expiry = window.localStorage.getItem("dashboard-token-expiry");
    if (expiry && Date.now() > Number(expiry)) {
      window.localStorage.removeItem("dashboard-token");
      window.localStorage.removeItem("dashboard-token-expiry");
      return;
    }
    setToken(stored);
  }, []);

  const login = async (password) => {
    setStatus("loading");
    setErrorCode("");
    try {
      const res = await fetch(buildApiUrl("/api/auth/login"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setErrorCode(data?.error || "unknown");
        setStatus("idle");
        return false;
      }
      setToken(data.token);
      window.localStorage.setItem("dashboard-token", data.token);
      setStatus("idle");
      return true;
    } catch {
      setErrorCode("network");
      setStatus("idle");
      return false;
    }
  };

  const logout = () => {
    setToken("");
    window.localStorage.removeItem("dashboard-token");
  };

  const clearError = () => setErrorCode("");

  const apiFetch = async (path, options = {}) => {
    const headers = {
      ...(options.headers || {}),
      Authorization: token ? `Bearer ${token}` : "",
    };
    const res = await fetch(buildApiUrl(path), {
      ...options,
      headers,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      const code = data?.error || "unknown";
      if (res.status === 401) logout();
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
    }),
    [token, status, errorCode],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
