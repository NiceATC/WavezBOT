import { t as translate } from "../lib/i18n.js";

const DEFAULT_NAME = "WavezBOT";

export function buildBanner({
  name = DEFAULT_NAME,
  version = "0.0.0",
  locale,
} = {}) {
  const title = translate("banner.title", { name, version }, locale);
  const lines = [
    "N   N  IIIII   CCCC  EEEEE   AAA   TTTTT   CCCC",
    "NN  N    I    C      E      A   A    T    C",
    "N N N    I    C      EEE    AAAAA    T    C",
    "N  NN    I    C      E      A   A    T    C",
    "N   N  IIIII   CCCC  EEEEE  A   A    T     CCCC",
    "",
    title,
    "",
  ];
  return lines.join("\n");
}

export function printBanner(opts) {
  console.log(buildBanner(opts));
}
