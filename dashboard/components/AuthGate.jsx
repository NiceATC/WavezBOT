"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { destroyTurnstile, ensureTurnstile } from "../lib/turnstile";

const ERROR_MAP = {
  invalid_password: "dashboard.auth.invalidPassword",
  missing_password: "dashboard.auth.missingPassword",
  invalid_api_key: "dashboard.errors.unauthorized",
  unauthorized: "dashboard.errors.unauthorized",
  missing_turnstile_token: "dashboard.errors.unauthorized",
  invalid_turnstile: "dashboard.errors.unauthorized",
  turnstile_verification_failed: "dashboard.errors.network",
  turnstile_unavailable: "dashboard.errors.network",
  network: "dashboard.errors.network",
  unknown: "dashboard.errors.unknown",
};

const TURNSTILE_ENABLED =
  String(process.env.NEXT_PUBLIC_DASHBOARD_TURNSTILE_ENABLED ?? "")
    .toLowerCase()
    .trim() === "true";
const TURNSTILE_SITE_KEY = String(
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "",
).trim();

export default function AuthGate({ children }) {
  const { token, login, status, errorCode, clearError, turnstileRequired, turnstileSiteKey: contextSiteKey } = useAuth();
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState("");
  const [remember, setRemember] = useState(false);
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);

  const resolvedSiteKey = contextSiteKey || TURNSTILE_SITE_KEY;
  const turnstileActive = (TURNSTILE_ENABLED || turnstileRequired) && Boolean(resolvedSiteKey);

  useEffect(() => {
    if (!turnstileActive) return;
    let disposed = false;

    setTurnstileToken("");
    setTurnstileError("");

    ensureTurnstile()
      .then((turnstile) => {
        if (disposed || !containerRef.current) return;
        destroyTurnstile(widgetIdRef.current, containerRef.current);
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: resolvedSiteKey,
          callback: (value) => {
            setTurnstileToken(String(value || ""));
            setTurnstileError("");
          },
          "expired-callback": () => {
            setTurnstileToken("");
          },
          "error-callback": () => {
            setTurnstileToken("");
            setTurnstileError("Turnstile indisponivel. Recarregue a pagina.");
          },
        });
      })
      .catch(() => {
        if (!disposed) {
          setTurnstileToken("");
          setTurnstileError("Turnstile indisponivel. Recarregue a pagina.");
        }
      });

    return () => {
      disposed = true;
      destroyTurnstile(widgetIdRef.current, containerRef.current);
      widgetIdRef.current = null;
    };
  }, [turnstileActive, resolvedSiteKey]);

  const submitLogin = () => {
    login(password, {
      turnstileToken: turnstileActive ? turnstileToken : "",
      remember,
    });
  };

  if (status === "checking") {
    return (
      <div className="auth-card">
        <h1 className="auth-title">
          <i className="fa-solid fa-shield-halved" /> {t("dashboard.auth.title")}
        </h1>
        <p className="muted">Verificando sessao...</p>
      </div>
    );
  }

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
          if (event.key === "Enter") submitLogin();
        }}
      />
      {turnstileActive ? (
        <div className="turnstile-wrap auth-turnstile" style={{ marginTop: "10px" }}>
          <div ref={containerRef} className="turnstile-host" />
        </div>
      ) : null}
      {turnstileError ? <p className="muted" style={{ textAlign: "center", marginTop: "4px" }}>{turnstileError}</p> : null}
      {errorKey ? <p className="muted">{t(errorKey)}</p> : null}
      <label className="modal-remember" style={{ marginTop: "4px" }}>
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        />
        {t("dashboard.auth.rememberMe", "Continuar conectado por 30 dias")}
      </label>
      <div className="auth-actions">
        <button
          className="button accent"
          onClick={submitLogin}
          disabled={status === "loading" || (turnstileActive && !turnstileToken)}
        >
          {t("dashboard.auth.login")}
        </button>
      </div>
    </div>
  );
}
