import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getQuotaStatus, type QuotaStatus } from "@/lib/quota.functions";
import { canStartAnalysis, isCooldownActive } from "@/lib/quota";
import { useLanguage } from "@/lib/i18n";

/**
 * Shows the signed-in user's Free-plan allowance from the authoritative server
 * response. The browser display is informational only; enforcement is server-side.
 */
export function QuotaStatusCard({ onChange }: { onChange?: (q: QuotaStatus | null) => void }) {
  const fetchStatus = useServerFn(getQuotaStatus);
  const { t, fmtDateTime } = useLanguage();
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetchStatus()
      .then((q) => {
        if (!active) return;
        setQuota(q);
        onChange?.(q);
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
        onChange?.(null);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) return null;
  if (!quota) {
    return <p className="text-xs text-muted-foreground">{t("quota.checking")}</p>;
  }
  if (quota.unlimited) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("quota.unlimited", { plan: t(`plan.${quota.plan}.name`) })}
      </p>
    );
  }

  const cooldown = isCooldownActive(quota);
  const nextAt = quota.next_available_at ?? quota.cooldown_until;

  return (
    <div className="rounded-lg border border-border bg-muted/50 p-3 text-xs">
      {cooldown ? (
        <>
          <p className="font-medium text-foreground">{t("quota.usedTitle")}</p>
          <p className="mt-1 text-muted-foreground">
            {t("quota.usedText")}
            {nextAt ? <> {t("quota.onDate", { date: fmtDateTime(nextAt) })}</> : null}.
          </p>
          <p className="mt-1 text-muted-foreground">{t("quota.savedAvailable")}</p>
        </>
      ) : (
        <p className="text-muted-foreground">
          {t("quota.remaining", { remaining: quota.remaining ?? 0, batch: quota.batch_size ?? 0 })}
        </p>
      )}
      {!canStartAnalysis(quota) ? (
        <Link to="/pricing" className="mt-2 inline-block font-medium text-primary hover:underline">
          {t("quota.upgrade")}
        </Link>
      ) : null}
    </div>
  );
}
