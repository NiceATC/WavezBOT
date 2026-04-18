/**
 * scripts/clean-youtube-cookies.js
 *
 * Limpa um arquivo de cookies JSON do YouTube (formato EditThisCookie),
 * mantendo apenas os cookies necessários para autenticação ytdl-core.
 *
 * Uso:
 *   node scripts/clean-youtube-cookies.js [entrada] [saída]
 *
 * Exemplos:
 *   node scripts/clean-youtube-cookies.js                            # lê cookies.json, sobrescreve
 *   node scripts/clean-youtube-cookies.js ~/Downloads/cookies.json cookies.json
 *
 * Como exportar os cookies:
 *   1. Instale a extensão EditThisCookie no Chrome/Firefox
 *   2. Acesse youtube.com logado
 *   3. Clique na extensão → ícone Export (seta para baixo)
 *   4. Cole o conteúdo em cookies.json na raiz do projeto
 */

import fs from "fs";
import path from "path";
import { cleanYoutubeCookieFile } from "../helpers/youtube-cookies.js";

const args = process.argv.slice(2);
const root = process.cwd();
const inputFile  = args[0] ? path.resolve(args[0]) : path.join(root, "cookies.json");
const outputFile = args[1] ? path.resolve(args[1]) : inputFile;

if (!fs.existsSync(inputFile)) {
  console.error(`Arquivo não encontrado: ${inputFile}`);
  process.exit(1);
}

if (outputFile !== inputFile) {
  fs.copyFileSync(inputFile, outputFile);
}

const { kept, removed } = cleanYoutubeCookieFile(outputFile);
const keptNames = kept.map((c) => c.name).filter(Boolean);

console.log(`✓ Mantidos  (${keptNames.length}): ${keptNames.join(", ")}`);
console.log(`✗ Removidos (${removed.length}): ${removed.join(", ") || "nenhum"}`);
console.log(`→ Salvo em: ${outputFile}`);

