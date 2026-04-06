"use client";

import { useState } from "react";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";

const ERROR_MAP = {
  invalid_password: "dashboard.auth.invalidPassword",
  missing_password: "dashboard.auth.missingPassword",
  invalid_api_key: "dashboard.errors.unauthorized",
  unauthorized: "dashboard.errors.unauthorized",
  network: "dashboard.errors.network",
  unknown: "dashboard.errors.unknown",
};

export default function AuthGate({ children }) {
  const { token, login, status, errorCode, clearError } = useAuth();
  const { t } = useI18n();
  const [password, setPassword] = useState("");

  if (token) return children;

  const errorKey = ERROR_MAP[errorCode] || (errorCode ? "dashboard.errors.unknown" : "");

  return (
    <div className="auth-card">
      <h1 className="auth-title">
        <i className="fa-solid fa-lock" /> {t("dashboard.auth.title")}
      </h1>
      <label htmlFor="password">{t("dashboard.auth.passwordLabel")}</label>
      <input
        id="password"
        className="input"
        type="password"
        value={password}
        placeholder={t("dashboard.auth.passwordPlaceholder")}
        onChange={(event) => {
          setPassword(event.target.value);
          if (errorCode) clearError();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            login(password);
          }
        }}
      />
      {errorKey ? <p className="muted">{t(errorKey)}</p> : null}
      <div className="auth-actions">
        <button
          className="button accent"
          onClick={() => login(password)}
          disabled={status === "loading"}
        >
          {t("dashboard.auth.login")}
        </button>
      </div>
    </div>
  );
}
