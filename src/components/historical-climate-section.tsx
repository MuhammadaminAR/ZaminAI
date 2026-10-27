import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { historicalWeatherAnalysis } from "@/lib/historical-weather.functions";
import type { HistoricalWeatherResult } from "@/lib/historical-weather.server";
import { loadHistoricalClimate, saveHistoricalClimate } from "@/lib/store";
import { annualMetricStats } from "@/lib/historical-climate-view";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";

type State = { kind: "loading" } | { kind: "error"; message: string; retryAfter: string | null } | { kind: "ready"; data: HistoricalWeatherResult; saved: boolean };

export function HistoricalClimateSection({ analysisId, lat, lng }: { analysisId: string; lat: number; lng: number }) {
  const fetchHist = useServerFn(historicalWeatherAnalysis);
  const { t } = useLanguage();
  const [state, setState] = useState<State>({ kind: "loading" });
  const started = useRef(false);

  const run = async (allowSaved: boolean) => {
    setState({ kind: "loading" });
    try {
      if (allowSaved) {
        const saved = await loadHistoricalClimate(analysisId);
        if (saved && saved.requested.latitude === lat && saved.requested.longitude === lng) return setState({ kind: "ready", data: saved, saved: true });
      }
      // Exact saved coordinates — never a region name, never rounded.
      const res = await fetchHist({ data: { latitude: lat, longitude: lng } });
      if (res.status === "error" || res.status === "no_data") {
        // HTTP 429 is a provider rate limit, never "no data for this location".
        if (res.error_kind === "rate_limited") return setState({ kind: "error", message: t("errors.tooMany"), retryAfter: res.retry_after ?? null });
        return setState({ kind: "error", message: res.source === "Open-Meteo" ? (res.errors[0] ?? t("climate.unavailableNow")) : t("climate.preparedUnavailable"), retryAfter: null });
      }
      await saveHistoricalClimate(analysisId, res).catch((e) => console.error("save historical", e));
      setState({ kind: "ready", data: res, saved: false });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : t("climate.lookupFailed"), retryAfter: null });
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="mt-10">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("climate.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("climate.sub")}</p>
      </div>
      {state.kind === "loading" ? (
        <div className="card-surface mt-4 p-4 text-sm text-muted-foreground">{t("climate.loading")}</div>
      ) : state.kind === "error" ? (
        <div className="card-surface mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-foreground">{state.message}</p>
          <RetryButton retryAfter={state.retryAfter} onRetry={() => void run(true)} />
        </div>
      ) : (
        <ClimateBody d={state.data} />
      )}
    </section>
  );
}

function RetryButton({ retryAfter, onRetry }: { retryAfter: string | null; onRetry: () => void }) {
  const [, tick] = useState(0);
  const { t } = useLanguage();
  const blocked = !!retryAfter && new Date(retryAfter).getTime() > Date.now();
  useEffect(() => {
    if (!blocked || !retryAfter) return;
    const tm = setTimeout(() => tick((n) => n + 1), Math.min(new Date(retryAfter).getTime() - Date.now() + 500, 2 ** 31 - 1));
    return () => clearTimeout(tm);
  }, [blocked, retryAfter]);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={onRetry} disabled={blocked} size="sm">
        {t("climate.retry")}
      </Button>
      {blocked ? <span className="text-xs text-muted-foreground">{t("climate.availableAfter", { time: new Date(retryAfter ?? "").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}</span> : null}
    </div>
  );
}

function ClimateBody({ d }: { d: HistoricalWeatherResult }) {
  const { t, fmtDateTime } = useLanguage();
  const MONTHS = Array.from({ length: 12 }, (_, i) => t(`month.${i + 1}`));
  const NA = t("climate.noData");
  const fmt = (v: number | null | undefined, unit: string) => (v === null || v === undefined ? NA : `${v} ${unit}`);
  void fmt;
  const precipCfg = { value: { label: t("climate.precip"), color: "var(--primary)" } } satisfies ChartConfig;
  const tempCfg = { value: { label: t("climate.meanTemp"), color: "var(--warning)" } } satisfies ChartConfig;
  const precipSource = d.sources.find((s) => s.variables.includes("precipitation_sum"))?.dataset ?? t("climate.precipUnavailable");
  const temperatureSource = d.sources.find((s) => s.variables.includes("temperature_2m_mean"))?.dataset ?? t("climate.tempUnavailable");
  // Per-metric availability: each metric uses only its own valid years.
  const precip = annualMetricStats(d.annual, (a) => a.precipitation_total_mm);
  const rain = annualMetricStats(d.annual, (a) => a.rain_total_mm);
  const temp = annualMetricStats(d.annual, (a) => a.temperature_mean_c);
  const et0 = annualMetricStats(d.annual, (a) => a.et0_total_mm);

  const annualP = d.annual.filter((a) => a.precipitation_total_mm !== null).map((a) => ({ year: String(a.year), value: a.precipitation_total_mm }));
  const annualT = d.annual.filter((a) => a.temperature_mean_c !== null).map((a) => ({ year: String(a.year), value: a.temperature_mean_c }));
  const monthP = d.monthly.filter((m) => m.precipitation_avg_total_mm !== null).map((m) => ({ month: MONTHS[m.month - 1], value: m.precipitation_avg_total_mm }));
  const monthT = d.monthly.filter((m) => m.temperature_mean_avg_c !== null).map((m) => ({ month: MONTHS[m.month - 1], value: m.temperature_mean_avg_c }));
  const hasEt0 = d.monthly.some((m) => m.et0_avg_total_mm !== null);
  const validMonths = d.monthly.filter((m) => m.precipitation_avg_total_mm !== null);
  const wettestMonth = validMonths.length ? validMonths.reduce((a, b) => (b.precipitation_avg_total_mm! > a.precipitation_avg_total_mm! ? b : a)) : null;
  const driestMonth = validMonths.length ? validMonths.reduce((a, b) => (b.precipitation_avg_total_mm! < a.precipitation_avg_total_mm! ? b : a)) : null;

  const basedOn = (n: number) => t("climate.basedOn", { n });
  const unavailableMetrics = [
    !precip.years.length ? t("climate.metricPrecip") : null,
    !rain.years.length ? t("climate.metricRain") : null,
    !temp.years.length ? t("climate.metricTemp") : null,
    !et0.years.length ? t("climate.metricEt0") : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={t("climate.avgPrecip")} value={precip.average ?? NA} unit={precip.average != null ? t("climate.mmYear") : undefined} hint={precip.years.length ? `${basedOn(precip.years.length)} · ${precipSource}` : precipSource} />
        <MetricCard label={t("climate.avgRain")} value={rain.average ?? NA} unit={rain.average != null ? t("climate.mmYear") : undefined} hint={rain.years.length ? `${basedOn(rain.years.length)} · ${t("climate.rainOnly")}` : t("climate.rainOnly")} />
        <MetricCard label={t("climate.avgTemp")} value={temp.average ?? NA} unit={temp.average != null ? "°C" : undefined} hint={temp.years.length ? `${basedOn(temp.years.length)} · ${temperatureSource}` : temperatureSource} />
        <MetricCard label={t("climate.avgEt0")} value={et0.average ?? NA} unit={et0.average != null ? t("climate.mmYear") : undefined} hint={et0.years.length ? `${basedOn(et0.years.length)} · ERA5-Land` : t("climate.et0Unavailable")} />
        <MetricCard label={t("climate.wettestYear")} value={precip.max ? precip.max.year : NA} hint={precip.max ? `${precip.max.value} ${t("climate.mmPrecip")} · ${t("climate.ofValidYears", { n: precip.years.length })}` : undefined} />
        <MetricCard label={t("climate.driestYear")} value={precip.min ? precip.min.year : NA} hint={precip.min ? `${precip.min.value} ${t("climate.mmPrecip")} · ${t("climate.ofValidYears", { n: precip.years.length })}` : undefined} />
        <MetricCard label={t("climate.wettestMonth")} value={wettestMonth ? MONTHS[wettestMonth.month - 1]! : NA} hint={wettestMonth ? `${wettestMonth.precipitation_avg_total_mm} ${t("climate.mmMonthAvg")}` : undefined} />
        <MetricCard label={t("climate.driestMonth")} value={driestMonth ? MONTHS[driestMonth.month - 1]! : NA} hint={driestMonth ? `${driestMonth.precipitation_avg_total_mm} ${t("climate.mmMonthAvg")}` : undefined} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title={t("climate.annualPrecip")} sub={t("climate.annualPrecipSub", { source: precipSource })} empty={!annualP.length}>
          <ChartContainer config={precipCfg} className="h-56 w-full">
            <BarChart data={annualP}><CartesianGrid vertical={false} /><XAxis dataKey="year" /><YAxis unit=" mm" width={60} />
              <ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="value" fill="var(--color-value)" radius={3} /></BarChart>
          </ChartContainer>
        </ChartCard>
        <ChartCard title={t("climate.annualTemp")} sub={t("climate.annualTempSub", { source: temperatureSource })} empty={!annualT.length}>
          <ChartContainer config={tempCfg} className="h-56 w-full">
            <LineChart data={annualT}><CartesianGrid vertical={false} /><XAxis dataKey="year" /><YAxis unit=" °C" width={60} domain={["auto", "auto"]} />
              <ChartTooltip content={<ChartTooltipContent />} /><Line dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot /></LineChart>
          </ChartContainer>
        </ChartCard>
        <ChartCard title={t("climate.monthlyPrecip")} sub={t("climate.monthlyPrecipSub")} empty={!monthP.length}>
          <ChartContainer config={precipCfg} className="h-56 w-full">
            <BarChart data={monthP}><CartesianGrid vertical={false} /><XAxis dataKey="month" /><YAxis unit=" mm" width={60} />
              <ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="value" fill="var(--color-value)" radius={3} /></BarChart>
          </ChartContainer>
        </ChartCard>
        <ChartCard title={t("climate.monthlyTemp")} sub={t("climate.monthlyTempSub")} empty={!monthT.length}>
          <ChartContainer config={tempCfg} className="h-56 w-full">
            <LineChart data={monthT}><CartesianGrid vertical={false} /><XAxis dataKey="month" /><YAxis unit=" °C" width={60} domain={["auto", "auto"]} />
              <ChartTooltip content={<ChartTooltipContent />} /><Line dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot /></LineChart>
          </ChartContainer>
        </ChartCard>
      </div>

      <details className="card-surface mt-4 p-4">
        <summary className="cursor-pointer text-sm font-medium text-foreground">{t("climate.monthlyTable")}</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr><th className="py-1 pr-3">{t("climate.colMonth")}</th><th className="pr-3">{t("climate.colPrecip")}</th><th className="pr-3">{t("climate.colRain")}</th>
                <th className="pr-3">{t("climate.colMean")}</th><th className="pr-3">{t("climate.colMin")}</th><th className="pr-3">{t("climate.colMax")}</th><th className="pr-3">{t("climate.colEt0")}</th><th>{t("climate.colValidYears")}</th></tr>
            </thead>
            <tbody>
              {d.monthly.map((m) => (
                <tr key={m.month} className="border-t border-border">
                  <td className="py-1 pr-3">{MONTHS[m.month - 1]}</td>
                  <td className="pr-3">{m.precipitation_avg_total_mm ?? "—"}</td>
                  <td className="pr-3">{m.rain_avg_total_mm ?? "—"}</td>
                  <td className="pr-3">{m.temperature_mean_avg_c ?? "—"}</td>
                  <td className="pr-3">{m.temperature_min_avg_c ?? "—"}</td>
                  <td className="pr-3">{m.temperature_max_avg_c ?? "—"}</td>
                  <td className="pr-3">{m.et0_avg_total_mm ?? t("crops.unavailable")}</td>
                  <td>{m.valid_years.precipitation_sum} / {m.valid_years.rain_sum} / {m.valid_years.temperature_2m_mean}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!hasEt0 ? (
            <p className="mt-2 text-xs text-muted-foreground">{t("climate.et0NotEstimated")}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">{t("climate.dashMeans")}</p>
        </div>
      </details>

      {d.sources.some((src) => src.status === "error") ? (
        <p className="mt-4 text-xs text-muted-foreground">
          {d.error_kind === "rate_limited" ? t("errors.tooMany") : t("climate.datasetError")}
        </p>
      ) : null}

      {unavailableMetrics.length ? (
        <p className="mt-4 text-xs text-muted-foreground">
          {t("climate.unavailableFrom", { metrics: unavailableMetrics.join(", ") })}
        </p>
      ) : null}

      <div className="mt-4 text-xs text-muted-foreground space-y-1">
        <p>{t("climate.gridNote")}</p>
        <p>{t("climate.period", { start: d.start_date, end: d.end_date, source: d.source, tz: d.timezone || t("res.unknown") })}</p>
        {d.sources.map((src) => (
          <p key={src.model}>{src.dataset} — {src.spatial_resolution} — {src.variables.join(", ")} ({src.status}) {src.grid_cell ? `· Cell ${src.grid_cell.id} · ${src.grid_cell.version} · center ${src.returned.latitude}, ${src.returned.longitude}` : ""} {src.period ? `· ${src.period.start} to ${src.period.end}` : ""} {src.licence ? `· ${src.licence}` : ""}</p>
        ))}
        <p>{t("climate.fetched", { date: fmtDateTime(d.fetched_at), lat: d.requested.latitude, lng: d.requested.longitude })}</p>
      </div>
    </>
  );
}

function ChartCard({ title, sub, empty, children }: { title: string; sub: string; empty: boolean; children: React.ReactNode }) {
  const { t } = useLanguage();
  return (
    <div className="card-surface p-4">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mb-2 text-xs text-muted-foreground">{sub}</p>
      {empty ? <p className="py-10 text-center text-sm text-muted-foreground">{t("climate.noData")}</p> : children}
    </div>
  );
}
