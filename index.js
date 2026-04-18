/**
 * index.js — WavezBOT entry point
 *
 * Usage:
 *   node index.js                  # production
 *   node --watch index.js          # auto-restart on changes (Node ≥ 18)
 *
 * Required env vars (read from .env):
 *   BOT_EMAIL, BOT_PASSWORD
 *
 * See .env.example for all available options.
 */
import { WavezBot } from "./lib/bot.js";
import { loadConfig } from "./lib/config.js";
import { initStorage, getAllSettings } from "./lib/storage.js";
import { applyStoredSettings } from "./lib/settings.js";
import { sleep } from "./helpers/time.js";
import { isServerDownError } from "./helpers/errors.js";
import { printBanner } from "./helpers/banner.js";
import { BOT_VERSION } from "./lib/version.js";
import { t as translate } from "./lib/i18n.js";
import { startDashboardServer } from "./lib/dashboard/server.js";
import { maybeCleanCookieFileOnStart } from "./helpers/youtube-cookies.js";

let bot;
let locale;
let dashboardServer;
const RETRY_MS = 30_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

const t = (key, vars) => translate(key, vars, locale);

// ── Graceful shutdown ─────────────────────────────────────────────────────────

let stopping = false;

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(t("index.shutdown", { signal }));
  const timeoutId = setTimeout(() => {
    console.error(
      t("index.shutdownTimeout", {
        seconds: SHUTDOWN_TIMEOUT_MS / 1000,
      }),
    );
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    if (dashboardServer) {
      await dashboardServer.stop();
    }
    if (bot) await bot.stop();
  } catch (err) {
    console.error(t("index.shutdownError", { error: err.message }));
  } finally {
    clearTimeout(timeoutId);
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (err) => {
  console.error(t("index.uncaughtException", { error: err?.message ?? err }));
  void shutdown("uncaughtException");
});
process.on("unhandledRejection", (err) => {
  console.error(t("index.unhandledRejection", { error: err?.message ?? err }));
  void shutdown("unhandledRejection");
});
// ── Start ──────────────────────────────────────────────────────────────────────
async function main() {
  let cfg;
  try {
    await initStorage();
    cfg = applyStoredSettings(loadConfig(), await getAllSettings());
    locale = cfg.locale;
    printBanner({ name: "NiceATC", version: BOT_VERSION, locale });
    maybeCleanCookieFileOnStart(cfg);
    bot = new WavezBot(cfg);
    await bot.loadAfkState();
    await bot.loadModules();
    try {
      dashboardServer = await startDashboardServer(bot);
    } catch (err) {
      console.error(
        t("index.dashboardFailed", {
          error: err.message,
        }),
      );
    }
  } catch (err) {
    console.error(t("index.initFailed", { error: err.message }));
    process.exit(1);
  }

  while (true) {
    try {
      await bot.connect();
      return;
    } catch (err) {
      if (isServerDownError(err)) {
        console.error(
          t("index.serverUnavailable", {
            seconds: RETRY_MS / 1000,
          }),
        );
        await sleep(RETRY_MS);
        continue;
      }

      console.error(t("index.fatalStartup", { error: err.message }));
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(t("index.mainFailed", { error: err.message }));
  process.exit(1);
});
