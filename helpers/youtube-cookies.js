/**
 * helpers/youtube-cookies.js
 *
 * Gerencia o arquivo de cookies do YouTube no novo formato JSON (EditThisCookie),
 * compatível com ytdl.createAgent() do @distube/ytdl-core.
 *
 * Formato esperado: array JSON exportado pelo EditThisCookie.
 * Arquivo padrão: cookies.json na raiz do projeto.
 * Configurável via cfg.mediaCheckCookieFile.
 */

import fs from "fs";
import path from "path";
import ytdl from "@distube/ytdl-core";

// Cookies essenciais para autenticação YouTube (ytdl-core / yt-dlp)
const ESSENTIAL_COOKIES = new Set([
  "SID",
  "HSID",
  "SSID",
  "APISID",
  "SAPISID",
  "__Secure-1PSID",
  "__Secure-3PSID",
  "__Secure-1PAPISID",
  "__Secure-3PAPISID",
  "__Secure-1PSIDTS",
  "__Secure-3PSIDTS",
  "SIDCC",
  "__Secure-1PSIDCC",
  "__Secure-3PSIDCC",
  "LOGIN_INFO",
]);

export function resolveCookiePath(cfg) {
  const configured = String(cfg?.mediaCheckCookieFile ?? "").trim();
  return configured
    ? path.resolve(process.cwd(), configured)
    : path.resolve(process.cwd(), "cookies.json");
}

/**
 * Lê, filtra e sobrescreve o arquivo JSON de cookies in-place.
 * @param {string} filePath  Caminho absoluto para o arquivo cookies.json
 * @returns {{ kept: object[], removed: string[] }}
 */
export function cleanYoutubeCookieFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const all = JSON.parse(raw);
  if (!Array.isArray(all)) throw new Error("Expected a JSON array of cookies");

  const kept = all.filter((c) => ESSENTIAL_COOKIES.has(c?.name));
  const removed = all
    .filter((c) => !ESSENTIAL_COOKIES.has(c?.name))
    .map((c) => c?.name ?? "?");

  fs.writeFileSync(filePath, JSON.stringify(kept, null, 2), "utf8");
  return { kept, removed };
}

/**
 * Cria um ytdl.Agent a partir do arquivo cookies.json.
 * Retorna null se o arquivo não existir ou estiver vazio.
 * @param {object} cfg
 * @param {boolean} [debug]
 * @returns {import("@distube/ytdl-core").Agent | null}
 */
export function createCookieAgent(cfg, debug = false) {
  const filePath = resolveCookiePath(cfg);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const cookies = JSON.parse(raw);
    if (!Array.isArray(cookies) || cookies.length === 0) {
      if (debug) console.log("[cookies] cookies.json vazio ou inválido.");
      return null;
    }
    return ytdl.createAgent(cookies);
  } catch (err) {
    if (debug)
      console.log(`[cookies] Falha ao criar agent: ${err?.message ?? err}`);
    return null;
  }
}

/**
 * Se existir um cookie.txt (ou o caminho configurado), limpa-o.
 * Silencioso em produção; retorna true se limpou, false se não havia arquivo.
 * @param {object} cfg  Config do bot (pode ter cfg.mediaCheckCookieFile)
 */
export function maybeCleanCookieFileOnStart(cfg) {
  const filePath = resolveCookiePath(cfg);
  if (!fs.existsSync(filePath)) return false;

  try {
    const { kept, removed } = cleanYoutubeCookieFile(filePath);
    console.log(
      `[cookies] Arquivo limpo: ${kept.length} cookies mantidos, ${removed.length} removidos.`,
    );
    return true;
  } catch (err) {
    console.warn(
      `[cookies] Falha ao limpar cookies.json: ${err?.message ?? err}`,
    );
    return false;
  }
}
