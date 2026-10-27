import type { AnalysisStatus } from "@/lib/types";
import { useLanguage } from "@/lib/i18n";

const styles: Record<AnalysisStatus, string> = {
  queued: "bg-muted text-muted-foreground",
  processing: "bg-warning/15 text-foreground",
  complete: "bg-primary-soft text-primary",
  partial: "bg-warning/15 text-foreground",
  failed: "bg-destructive/10 text-destructive",
};

export function AnalysisStatusBadge({ status }: { status: AnalysisStatus }) {
  const { t } = useLanguage();
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${styles[status]}`}
    >
      {t(`status.${status}`)}
    </span>
  );
}

export function LevelBadge({ level }: { level: string }) {
  const { t } = useLanguage();
  const tone =
    level === "Excellent"
      ? "bg-primary text-primary-foreground"
      : level === "Good"
        ? "bg-primary-soft text-primary"
        : level === "Moderate"
          ? "bg-warning/20 text-foreground"
          : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {t(`level.${level}`)}
    </span>
  );
}
