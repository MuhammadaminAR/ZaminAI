import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useSession } from "@/hooks/use-session";
import { signOut } from "@/lib/store";
import { LOCALES, useLanguage, type Locale } from "@/lib/i18n";

export function LanguageSelector({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useLanguage();
  return (
    <select
      aria-label={t("nav.language")}
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      className={`rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary ${className}`}
    >
      {LOCALES.map((l) => (
        <option key={l.id} value={l.id}>
          {l.label}
        </option>
      ))}
    </select>
  );
}

export function LogoMark() {
  return (
    <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground" aria-hidden>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 15c0-5 3-8 8-9-.5 5-3.5 8-8 9Z" fill="currentColor" fillOpacity=".25" />
        <path d="M12 15c0-3-2-5.5-6-6.5.3 3.7 2.5 6 6 6.5Z" />
        <path d="M12 15v2" />
        <path d="M3 18h18M6 21h12" />
      </svg>
    </span>
  );
}

export function Navbar() {
  const { user, ready } = useSession();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const links = [
    { to: "/", label: t("nav.home") },
    { to: "/economics", label: t("econ.nav") },
    { to: "/pricing", label: t("nav.pricing") },
    { to: "/contact", label: t("nav.contact") },
  ] as const;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <LogoMark />
          <span className="text-lg font-semibold text-foreground">ZaminAI</span>
        </Link>

        <nav className="hidden items-center gap-3 xl:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-sm text-foreground font-medium" }}
              activeOptions={{ exact: l.to === "/" }}
            >
              {l.label}
            </Link>
          ))}
          {ready && user ? (
            <>
              <Link
                to="/dashboard"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("nav.dashboard")}
              </Link>
              {user.role === "admin" || user.role === "super_admin" ? (
                <Link
                  to="/admin"
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("nav.admin")}
                </Link>
              ) : null}
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/", replace: true });
                }}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("nav.logout")}
              </button>
            </>
          ) : (
            <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
              {t("nav.login")}
            </Link>
          )}
          <LanguageSelector />
          <Link
            to="/analyze"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("nav.analyzeCta")}
          </Link>
        </nav>

        <div className="flex items-center gap-2 xl:hidden">
          <LanguageSelector />
          <button
            type="button"
            aria-label={t("nav.menu")}
            className="rounded-lg border border-border px-3 py-2 text-sm"
            onClick={() => setOpen((v) => !v)}
          >
            ☰
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-border bg-card px-4 py-3 xl:hidden">
          <div className="flex flex-col gap-3">
            {links.map((l) => (
              <Link key={l.to} to={l.to} className="text-sm" onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
            {user ? (
              <Link to="/dashboard" className="text-sm" onClick={() => setOpen(false)}>
                {t("nav.dashboard")}
              </Link>
            ) : (
              <Link to="/login" className="text-sm" onClick={() => setOpen(false)}>
                {t("nav.login")}
              </Link>
            )}
            <Link
              to="/analyze"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground"
            >
              {t("nav.analyzeCta")}
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}

export function Footer() {
  const { t } = useLanguage();
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <LogoMark />
            <span className="text-lg font-semibold text-foreground">ZaminAI</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">{t("footer.tagline")}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{t("footer.product")}</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link to="/analyze">{t("footer.landAnalysis")}</Link>
            </li>
            <li>
              <Link to="/pricing">{t("footer.pricing")}</Link>
            </li>
            <li>
              <Link to="/dashboard">{t("footer.dashboard")}</Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{t("footer.company")}</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link to="/contact">{t("footer.contactSales")}</Link>
            </li>
            <li>
              <Link to="/login">{t("footer.login")}</Link>
            </li>
            <li>
              <Link to="/signup">{t("footer.createAccount")}</Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{t("footer.dataNotice")}</p>
          <p className="mt-3 text-sm text-muted-foreground">{t("footer.dataNoticeText")}</p>
        </div>
      </div>
      <div className="border-t border-border px-4 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} ZaminAI. {t("footer.rights")}
      </div>
    </footer>
  );
}
