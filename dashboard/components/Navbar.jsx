"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import AdminLoginModal from "./AdminLoginModal";

export default function Navbar({ autowootUrl, isAdmin = false }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { token, logout } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  function navClass(href) {
    const isActive =
      href === "/" ? pathname === "/" : pathname.startsWith(href);
    return `nav-link${isActive ? " active" : ""}`;
  }

  return (
    <>
      <Link className={navClass("/")} href="/">
        <i className="fa-solid fa-house" />
        {t("dashboard.nav.home")}
      </Link>
      <Link className={navClass("/commands")} href="/commands">
        <i className="fa-solid fa-terminal" />
        {t("dashboard.nav.commands")}
      </Link>
      <Link className={navClass("/shop")} href="/shop">
        <i className="fa-solid fa-store" />
        {t("dashboard.nav.shop")}
      </Link>
      <Link className={navClass("/vip")} href="/vip">
        <i className="fa-solid fa-crown" />
        {t("dashboard.nav.vip")}
      </Link>
      <Link className={navClass("/ranking")} href="/ranking">
        <i className="fa-solid fa-chart-line" />
        {t("dashboard.nav.ranking")}
      </Link>
      {autowootUrl ? (
        <a
          className="nav-link accent"
          href={autowootUrl}
          target="_blank"
          rel="noreferrer"
        >
          <i className="fa-solid fa-bolt" />
          {t("dashboard.nav.autowoot")}
        </a>
      ) : null}
      {isAdmin ? (
        <button className="button" onClick={logout}>
          <i className="fa-solid fa-right-from-bracket" />
          {t("dashboard.auth.logout")}
        </button>
      ) : token ? (
        <Link className={navClass("/admin")} href="/admin">
          <i className="fa-solid fa-shield-halved" />
          {t("dashboard.nav.admin")}
        </Link>
      ) : (
        <button
          className="nav-link nav-link-btn"
          onClick={() => setShowLogin(true)}
        >
          <i className="fa-solid fa-shield-halved" />
          {t("dashboard.nav.admin")}
        </button>
      )}

      {showLogin && (
        <AdminLoginModal onClose={() => setShowLogin(false)} />
      )}
    </>
  );
}
