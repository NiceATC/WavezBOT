"use client";

import LocaleSelect from "./LocaleSelect";
import { useI18n } from "../lib/i18n";

export default function Footer() {
  const { t } = useI18n();

  return (
    <footer className="footer">
      <div className="footer-left">
        <span className="footer-text">{t("dashboard.footer.madeWith")}</span>
        <span className="footer-heart" aria-hidden>
          <i className="fa-solid fa-heart" />
        </span>
        <span className="footer-text">{t("dashboard.footer.by")}</span>
        <span className="footer-name">NiceATC</span>
        <a
          className="footer-link"
          href="https://github.com/NiceATC"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub"
        >
          <i className="fa-brands fa-github footer-icon" />
        </a>
      </div>
      <div className="footer-right">
        <LocaleSelect />
      </div>
    </footer>
  );
}
