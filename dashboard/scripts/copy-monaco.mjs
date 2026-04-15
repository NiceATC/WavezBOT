import { cpSync, mkdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboardDir = join(__dirname, "..");

// Look for monaco-editor in local node_modules first, then parent
const candidates = [
  join(dashboardDir, "node_modules", "monaco-editor", "min", "vs"),
  join(dashboardDir, "..", "node_modules", "monaco-editor", "min", "vs"),
];

const src = candidates.find(existsSync);
if (!src) {
  console.error("monaco-editor not found. Run `npm install` in the dashboard directory first.");
  process.exit(1);
}

const dest = join(dashboardDir, "public", "monaco-editor", "min", "vs");
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`Monaco assets copied from ${src} to public/monaco-editor/min/vs`);
