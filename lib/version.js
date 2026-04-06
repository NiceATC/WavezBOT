import { createRequire } from "module";

const require = createRequire(import.meta.url);

let version = "0.0.5";
try {
  const pkg = require("../package.json");
  if (pkg?.version) version = String(pkg.version);
} catch {
  // best-effort
}

export const BOT_VERSION = version;
