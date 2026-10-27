import { cropProfiles } from "@/lib/crop-profiles";
import type { CropRecommendation } from "@/lib/types";
import { useLanguage } from "@/lib/i18n";
import { LevelBadge } from "./status-badge";

export function CropRecommendationCard({ rec }: { rec: CropRecommendation }) {
  const { t } = useLanguage();
  const emoji = cropProfiles.find((c) => c.id === rec.cropId)?.emoji ?? "🌿";

  return (
    <article className="card-surface flex h-full flex-col p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary-soft text-lg">
            {emoji}
          </span>
          <div>
            <h3 className="text-base font-semibold text-foreground">{t(`crop.${rec.cropId}`)}</h3>
            <p className="text-xs text-muted-foreground">{t("cropcard.suitability")}</p>
          </div>
        </div>
        <LevelBadge level={rec.level} />
      </header>

      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${rec.score}%` }} />
        </div>
        <span className="text-sm font-semibold text-foreground">{rec.score}/100</span>
      </div>

      {rec.reasons.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("cropcard.mainReasons")}
          </p>
          <ul className="mt-2 space-y-1.5">
            {rec.reasons.map((r) => (
              <li key={r} className="flex gap-2 text-sm text-foreground">
                <span className="text-primary">✓</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rec.limitations.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("cropcard.keyLimits")}
          </p>
          <ul className="mt-2 space-y-1.5">
            {rec.limitations.map((l) => (
              <li key={l} className="flex gap-2 text-sm text-muted-foreground">
                <span className="text-warning">!</span>
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-auto pt-4 text-sm text-muted-foreground">{rec.summary}</p>
    </article>
  );
}
