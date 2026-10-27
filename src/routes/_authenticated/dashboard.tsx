import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/metric-card";
import { AnalysisStatusBadge } from "@/components/status-badge";
import { DemoBadge, EmptyState, LoadingState } from "@/components/ui-states";
import { useSession } from "@/hooks/use-session";
import { deleteFarm, listAnalyses, listFarms } from "@/lib/store";
import { QuotaStatusCard } from "@/components/quota-status";
import { useLanguage } from "@/lib/i18n";
import type { Analysis, Farm } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Farmer dashboard — ZaminAI" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content: "Your saved farms, recent land analyses and current ZaminAI plan.",
      },
      { property: "og:title", content: "Farmer dashboard — ZaminAI" },
      { property: "og:description", content: "Saved farms, recent analyses and your plan." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user, ready } = useSession();
  const navigate = useNavigate();
  const { t, fmtDate } = useLanguage();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);

  useEffect(() => {
    if (ready && !user) navigate({ to: "/login" });
  }, [ready, user, navigate]);

  const refresh = async (userId: string) => {
    const [f, a] = await Promise.all([listFarms(userId), listAnalyses(userId)]);
    setFarms(f);
    setAnalyses(a);
  };

  useEffect(() => {
    if (!user) return;
    void refresh(user.id);
  }, [user]);

  if (!ready || !user) {
    return (
      <AppShell>
        <LoadingState label={t("dash.loading")} />
      </AppShell>
    );
  }

  const avgScore = analyses.length
    ? Math.round(analyses.reduce((s, a) => s + a.suitabilityScore, 0) / analyses.length)
    : 0;

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {t("dash.welcome", { name: user.fullName.split(" ")[0] ?? "" })}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("dash.sub")}</p>
        </div>
        <div className="flex items-center gap-3">
          <DemoBadge />
          <Link
            to="/analyze"
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t("dash.newAnalysis")}
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("dash.savedFarms")} value={farms.length} />
        <StatCard label={t("dash.analysesRun")} value={analyses.length} />
        <StatCard label={t("dash.avgSuitability")} value={avgScore ? `${avgScore}/100` : "—"} />
        <StatCard
          label={t("dash.currentPlan")}
          value={t(`plan.${user.plan}.name`)}
          sub={user.plan === "free" ? t("dash.freeSub") : t("dash.paidSub")}
        />
      </div>

      {user.plan === "free" ? (
        <div className="mt-4">
          <QuotaStatusCard />
        </div>
      ) : null}

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{t("dash.savedFarms")}</h2>
          <Link to="/analyze" className="text-sm font-medium text-primary hover:underline">
            {t("dash.addFarm")}
          </Link>
        </div>
        <div className="mt-4">
          {farms.length === 0 ? (
            <EmptyState
              title={t("dash.noFarmsTitle")}
              message={t("dash.noFarmsText")}
              icon="🌾"
              action={
                <Link
                  to="/analyze"
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  {t("nav.analyzeCta")}
                </Link>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {farms.map((farm) => (
                <div key={farm.id} className="card-surface p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">{farm.name}</h3>
                      <p className="text-xs text-muted-foreground">{farm.location.region}</p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => { await deleteFarm(farm.id); void refresh(user.id); }}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      {t("dash.remove")}
                    </button>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {farm.location.lat.toFixed(4)}, {farm.location.lng.toFixed(4)}
                  </p>
                  <p className="text-sm text-muted-foreground">{farm.areaHectares} {t("dash.hectares")}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">{t("dash.recent")}</h2>
        <div className="mt-4">
          {analyses.length === 0 ? (
            <EmptyState
              title={t("dash.noAnalysesTitle")}
              message={t("dash.noAnalysesText")}
              action={
                <Link
                  to="/analyze"
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  {t("nav.analyzeCta")}
                </Link>
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">{t("dash.colLocation")}</th>
                    <th className="px-4 py-3">{t("dash.colDate")}</th>
                    <th className="px-4 py-3">{t("dash.colScore")}</th>
                    <th className="px-4 py-3">{t("dash.colStatus")}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {analyses.slice(0, 8).map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{a.farmName}</p>
                        <p className="text-xs text-muted-foreground">{a.location.region}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(a.createdAt)}</td>
                      <td className="px-4 py-3 text-foreground">{a.suitabilityScore}/100</td>
                      <td className="px-4 py-3">
                        <AnalysisStatusBadge status={a.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to="/results/$id"
                          params={{ id: a.id }}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          {t("dash.view")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
