import { readdirSync } from "fs";
import path from "path";

export function listJsFilesRecursive(dirPath, ignorePaths = new Set()) {
  const out = [];
  const ignore = new Set([...ignorePaths].map((p) => path.resolve(String(p))));

  function walk(current) {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (ignore.has(path.resolve(fullPath))) continue;
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".js")) {
        out.push(fullPath);
      }
    }
  }

  walk(dirPath);
  return out;
}
