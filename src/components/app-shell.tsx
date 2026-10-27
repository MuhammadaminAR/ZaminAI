import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useSession } from "@/hooks/use-session";
import { useLanguage } from "@/lib/i18n";
import { Navbar } from "./navbar";

export function Sidebar() {
  const { user } = useSession();
  const { t } = useLanguage();

  const nav = [
    { to: "/dashboard", label: t("side.dashboard"), icon: "▦" },
    { to: "/analyze", label: t("side.analyze"), icon: "◎" },
    { to: "/economics", label: t("econ.nav"), icon: "◷" },
    { to: "/pricing", label: t("side.plans"), icon: "◈" },
    { to: "/contact", label: t("side.contact"), icon: "✉" },
  ] as const;

  return (
    <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
      <div className="sticky top-16 p-4">
        <nav className="space-y-1">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-accent"
              activeProps={{ className: "bg-primary-soft text-primary font-medium" }}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          ))}
          {user?.role === "admin" || user?.role === "super_admin" ? (
            <Link
              to="/admin"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-accent"
              activeProps={{ className: "bg-primary-soft text-primary font-medium" }}
            >
              <span aria-hidden>⚙</span>
              {t("side.admin")}
            </Link>
          ) : null}
        </nav>

        <div className="mt-6 rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{t("side.currentPlan")}</p>
          <p className="mt-1 text-sm font-semibold capitalize text-foreground">
            {t(`plan.${user?.plan ?? "free"}.name`)}
          </p>
          <Link
            to="/pricing"
            className="mt-3 block rounded-md bg-primary px-3 py-2 text-center text-xs font-medium text-primary-foreground"
          >
            {t("side.upgrade")}
          </Link>
        </div>
      </div>
    </aside>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto flex max-w-7xl">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
