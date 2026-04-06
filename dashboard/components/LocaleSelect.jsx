"use client";

import { useI18n } from "../lib/i18n";

export default function LocaleSelect({ className = "select-compact" }) {
  const { locale, locales, setLocale } = useI18n();
  const options = locales.length ? locales : [locale];

  return (
    <select
      className={`select ${className}`.trim()}
      value={locale}
      onChange={(event) => setLocale(event.target.value)}
    >
      {options.map((loc) => (
        <option key={loc} value={loc}>
          {loc}
        </option>
      ))}
    </select>
  );
}
