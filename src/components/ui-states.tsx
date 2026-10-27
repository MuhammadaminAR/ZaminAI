import type { ReactNode } from "react";
import { useLanguage } from "@/lib/i18n";

export function LoadingState({ label }: { label?: string }) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card p-10 text-center">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">{label ?? t("ui.loading")}</p>
    </div>
  );
}

export function ErrorState({
  title,
  message,
  action,
}: {
  title?: string;
  message: string;
  action?: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
      <h3 className="text-base font-semibold text-foreground">{title ?? t("ui.errorTitle")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
  icon = "🗺️",
}: {
  title: string;
  message: string;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
      <div className="text-3xl">{icon}</div>
      <h3 className="mt-3 text-base font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Demo labels are intentionally hidden from the UI (product decision). */
export function DemoBadge(_props: { className?: string }) {
  return null;
}

function _UnusedDemoBadge({ className = "" }: { className?: string }) {
  const { t } = useLanguage();
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-foreground ${className}`}
      title={t("ui.demoDataTitle")}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-warning" />
      {t("ui.demoData")}
    </span>
  );
}
