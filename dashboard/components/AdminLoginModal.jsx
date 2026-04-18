"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";

const REMEMBER_KEY = "dashboard-token-expiry";
const REMEMBER_DAYS = 30;

const ERROR_MAP = {
  invalid_password: "dashboard.auth.invalidPassword",
  missing_password: "dashboard.auth.missingPassword",
  invalid_api_key: "dashboard.errors.unauthorized",
  unauthorized: "dashboard.errors.unauthorized",
  network: "dashboard.errors.network",
  unknown: "dashboard.errors.unknown",
};

export default function AdminLoginModal({ onClose }) {
  const { login, status, errorCode, clearError } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const inputRef = useRef(null);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleLogin = async () => {
    const ok = await login(password);
    if (ok) {
      if (remember) {
        const expiry = Date.now() + REMEMBER_DAYS * 24 * 60 * 60 * 1000;
        window.localStorage.setItem(REMEMBER_KEY, String(expiry));
      } else {
        window.localStorage.removeItem(REMEMBER_KEY);
      }
      onClose();
      router.push("/admin");
    }
  };

  const errorKey = ERROR_MAP[errorCode] || (errorCode ? "dashboard.errors.unknown" : "");

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2 className="modal-title">
            <i className="fa-solid fa-shield-halved" />
            {t("dashboard.auth.title")}
          </h2>
          <button className="modal-close" onClick={onClose} title={t("dashboard.auth.cancel", "Fechar")}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="modal-body">
          <label className="modal-label" htmlFor="admin-password">
            {t("dashboard.auth.passwordLabel")}
          </label>
          <input
            ref={inputRef}
            id="admin-password"
            className="input"
            type="password"
            value={password}
            placeholder={t("dashboard.auth.passwordPlaceholder")}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errorCode) clearError();
            }}
            onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
          />
          {errorKey ? (
            <p className="modal-error">
              <i className="fa-solid fa-circle-exclamation" />
              {t(errorKey)}
            </p>
          ) : null}

          <label className="modal-remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            {t("dashboard.auth.rememberMe", `Continuar conectado por ${REMEMBER_DAYS} dias`)}
          </label>
        </div>

        <div className="modal-footer">
          <button className="button" onClick={onClose} disabled={status === "loading"}>
            {t("dashboard.auth.cancel", "Cancelar")}
          </button>
          <button
            className="button accent"
            onClick={handleLogin}
            disabled={status === "loading"}
          >
            {status === "loading" ? (
              <><i className="fa-solid fa-spinner fa-spin" /> {t("dashboard.auth.login")}</>
            ) : (
              <><i className="fa-solid fa-right-to-bracket" /> {t("dashboard.auth.login")}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
