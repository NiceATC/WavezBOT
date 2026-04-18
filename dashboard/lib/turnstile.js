const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const READY_TIMEOUT_MS = 10000;

export function ensureTurnstile() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("turnstile_unavailable"));
  }

  if (window.turnstile?.render) {
    return Promise.resolve(window.turnstile);
  }

  if (window.__dashboardTurnstilePromise) {
    return window.__dashboardTurnstilePromise;
  }

  window.__dashboardTurnstilePromise = new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId = null;
    let script = document.getElementById(SCRIPT_ID);

    const cleanup = () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      if (script) {
        script.removeEventListener("load", handleLoad);
        script.removeEventListener("error", handleError);
      }
    };

    const finishResolve = () => {
      if (settled || !window.turnstile?.render) return;
      settled = true;
      cleanup();
      resolve(window.turnstile);
    };

    const finishReject = () => {
      if (settled) return;
      settled = true;
      cleanup();
      delete window.__dashboardTurnstilePromise;
      reject(new Error("turnstile_unavailable"));
    };

    const waitUntilReady = () => {
      if (window.turnstile?.render) {
        finishResolve();
        return;
      }
      window.setTimeout(waitUntilReady, 50);
    };

    const handleLoad = () => {
      waitUntilReady();
    };

    const handleError = () => {
      finishReject();
    };

    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);
    timeoutId = window.setTimeout(finishReject, READY_TIMEOUT_MS);
    waitUntilReady();
  });

  return window.__dashboardTurnstilePromise;
}

export function destroyTurnstile(widgetId, container) {
  if (widgetId != null && window.turnstile?.remove) {
    window.turnstile.remove(widgetId);
  }
  if (container) {
    container.innerHTML = "";
  }
}
