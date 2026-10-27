import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Calculator, RotateCcw, Pencil, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Navbar, Footer } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/lib/i18n";
import { calculateEconomics, COST_FIELDS, ECONOMICS_CROPS, emptyEconomicsInputs, exampleEconomicsInputs, type EconomicsCrop, type EconomicsField, type EconomicsInputs } from "@/lib/farm-economics";

export const Route = createFileRoute("/economics")({
  head: () => ({ meta: [
    { title: "Farm Economics — ZaminAI" },
    { name: "description", content: "Estimate crop revenue, operating costs, profit and break-even prices using your own assumptions. Compare six crops with ZaminAI." },
    { property: "og:title", content: "Farm Economics — ZaminAI" },
    { property: "og:description", content: "Compare crop profitability with user-provided yields, prices and costs in UZS." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: FarmEconomics,
});

function FarmEconomics() {
  const { t, locale } = useLanguage();
  const [crop, setCrop] = useState<EconomicsCrop>("cotton");
  const [inputs, setInputs] = useState<Record<EconomicsCrop, EconomicsInputs>>(() =>
    Object.fromEntries(ECONOMICS_CROPS.map(c => [c, emptyEconomicsInputs()])) as Record<EconomicsCrop, EconomicsInputs>);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [examples, setExamples] = useState<Partial<Record<EconomicsCrop, boolean>>>({});
  const current = inputs[crop];
  const { errors, result } = calculateEconomics(current);
  const format = (value: number) => new Intl.NumberFormat(locale === "uz" ? "uz-Latn-UZ" : locale === "ru" ? "ru-RU" : "en-GB", { maximumFractionDigits: 2 }).format(value);
  const money = (value: number) => `${format(value)} UZS`;
  const rows = ECONOMICS_CROPS.map(c => ({ crop: c, input: inputs[c], result: calculateEconomics(inputs[c]).result }));
  const validRows = rows.filter(row => row.result !== null);
  const maximum = Math.max(1, ...validRows.map(row => Math.abs(row.result?.profit ?? 0)));
  const update = (field: EconomicsField, value: string) => {
    setInputs(prev => ({ ...prev, [crop]: { ...prev[crop], [field]: value } }));
    setTouched(prev => ({ ...prev, [`${crop}.${field}`]: true }));
  };
  const field = (name: EconomicsField, unit: string) => {
    const id = `econ-${name}`;
    const error = touched[`${crop}.${name}`] ? errors[name] : undefined;
    return <div key={name} className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-sm font-medium">{t(`econ.${name}`)} <span className="font-normal text-muted-foreground">({unit})</span></label>
      <Input id={id} type="text" inputMode="decimal" autoComplete="off" value={current[name]} onChange={e => update(name, e.target.value)}
        aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="h-11 tabular-nums" />
      {error ? <p id={`${id}-error`} className="mt-1 text-xs text-destructive">{t(`econ.${error}`)}</p> : null}
    </div>;
  };
  const metrics = result ? [
    ["profitPerHa", format(result.profitPerHa), t("econ.perHaUnit")],
    ["margin", result.margin === null ? "—" : format(result.margin), "%"],
    ["breakEven", result.breakEven === null ? "—" : format(result.breakEven), t("econ.priceUnit")],
    ["production", format(result.production), t("econ.tonnes")],
    ["revenuePerHa", format(result.revenuePerHa), t("econ.perHaUnit")],
    ["costsPerHa", format(result.costsPerHa), t("econ.perHaUnit")],
  ] : [];
  const status = result && result.profit < 0 ? "loss" : result && result.profit > 0 ? "gain" : "balanced";
  const StatusIcon = status === "loss" ? TrendingDown : status === "gain" ? TrendingUp : Minus;

  return <div className="min-h-screen bg-background">
    <Navbar />
    <main className="mx-auto min-w-0 max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8 border-b border-border pb-6">
        <div className="mb-3 flex items-center gap-2 text-primary"><Calculator className="h-5 w-5" aria-hidden /><span className="text-sm font-semibold">ZaminAI</span></div>
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{t("econ.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("econ.subtitle")}</p>
      </header>

      <div className="grid items-start gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="assumptions-title" className="card-surface p-5 sm:p-6">
            <div className="mb-5 flex items-baseline gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" aria-hidden>1</span>
              <div>
                <h2 id="assumptions-title" className="text-xl font-semibold">{t("econ.assumptions")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("econ.assumptionsNote")}</p>
              </div>
            </div>
            <label htmlFor="economics-crop" className="mb-2 block text-sm font-medium">{t("econ.crop")}</label>
            <select id="economics-crop" value={crop} onChange={e => { const selected = ECONOMICS_CROPS.find(c => c === e.target.value); if (selected) setCrop(selected); }} className="mb-5 h-11 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              {ECONOMICS_CROPS.map(c => <option key={c} value={c}>{t(`crop.${c}`)}</option>)}
            </select>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("area", t("econ.ha"))}{field("yield", t("econ.yieldUnit"))}
              <div className="sm:col-span-2">{field("price", t("econ.priceUnit"))}</div>
            </div>
          </section>

          <section aria-labelledby="costs-title" className="card-surface p-5 sm:p-6">
            <div className="mb-5 flex items-baseline gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" aria-hidden>2</span>
              <div>
                <h2 id="costs-title" className="text-xl font-semibold">{t("econ.costsTitle")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("econ.costNote")}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">{COST_FIELDS.map(name => field(name, "UZS"))}</div>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4 text-sm">
              <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => { setInputs(prev => ({ ...prev, [crop]: exampleEconomicsInputs() })); setExamples(prev => ({ ...prev, [crop]: true })); }}>{t("econ.example")}</button>
              <button type="button" className="inline-flex items-center gap-1.5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => { setInputs(prev => ({ ...prev, [crop]: emptyEconomicsInputs() })); setExamples(prev => ({ ...prev, [crop]: false })); setTouched(prev => Object.fromEntries(Object.entries(prev).filter(([key]) => !key.startsWith(`${crop}.`)))); }}><RotateCcw className="h-3.5 w-3.5" aria-hidden />{t("econ.reset")}</button>
            </div>
            {examples[crop] ? <p className="mt-3 text-sm text-muted-foreground" role="status">{t("econ.exampleNote")}</p> : null}
          </section>
        </div>

        <section aria-labelledby="results-title" className="min-w-0 lg:sticky lg:top-24">
          <div className="mb-5 flex items-baseline gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" aria-hidden>3</span>
            <h2 id="results-title" className="text-xl font-semibold">{t("econ.results")} <span className="text-base font-normal text-muted-foreground">· {t(`crop.${crop}`)}</span></h2>
          </div>
          <div className={`rounded-lg border p-5 ${result && result.profit < 0 ? "border-destructive/30 bg-destructive/5" : "border-primary/20 bg-primary-soft"}`}>
            <p className="text-sm font-medium">{t("econ.profit")}</p>
            <p data-testid="net-profit" className={`mt-2 break-words text-3xl font-semibold tabular-nums ${result && result.profit < 0 ? "text-destructive" : "text-primary"}`}>{result ? money(result.profit) : "—"}</p>
            {result ? <p className="mt-3 flex items-center gap-2 text-sm font-medium"><StatusIcon className="h-4 w-4" aria-hidden />{t(`econ.${status}`)}</p> : <p className="mt-3 text-sm text-muted-foreground">{t("econ.enter")}</p>}
          </div>
          {result ? <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="card-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("econ.revenue")}</p>
              <p data-testid="result-revenue" className="mt-1 break-words text-lg font-semibold tabular-nums">{money(result.revenue)}</p>
            </div>
            <div className="card-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("econ.costs")}</p>
              <p data-testid="result-costs" className="mt-1 break-words text-lg font-semibold tabular-nums">{money(result.costs)}</p>
            </div>
          </div> : null}
          {result ? <dl className="mt-2 grid grid-cols-1 gap-x-5 sm:grid-cols-2">
            {metrics.map(([key, value, unit]) => <div key={key} className="min-w-0 border-b border-border py-3.5">
              <dt className="text-sm text-muted-foreground">{t(`econ.${key}`)}</dt>
              <dd data-testid={`result-${key}`} className="mt-1 break-words text-xl font-semibold tabular-nums">{value} <span className="text-xs font-normal text-muted-foreground">{unit}</span></dd>
              {key === "margin" && result.margin === null ? <p className="mt-1 text-xs text-muted-foreground">{t("econ.noRevenue")}</p> : null}
              {key === "breakEven" && result.breakEven === null ? <p className="mt-1 text-xs text-muted-foreground">{t("econ.noProduction")}</p> : null}
            </div>)}
          </dl> : null}
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{t("econ.disclaimer")}</p>
        </section>
      </div>

      <section aria-labelledby="comparison-title" className="mt-12 min-w-0 border-t border-border pt-8">
        <h2 id="comparison-title" className="text-2xl font-semibold">{t("econ.comparison")}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{t("econ.compareNote")}</p>
        <div className="mt-6 max-w-full overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-muted text-xs text-muted-foreground"><tr>{["crop", "assumptionsColumn", "revenue", "costs", "profit", "profitPerHa"].map(key => <th key={key} scope="col" className="px-4 py-3 font-medium">{t(`econ.${key}`)}</th>)}<th scope="col" className="relative"><span className="sr-only">{t("econ.edit")}</span></th></tr></thead>
            <tbody className="divide-y divide-border">{rows.map(row => <tr key={row.crop} className={row.crop === crop ? "bg-primary-soft/50" : "bg-card"}>
              <th scope="row" className="px-4 py-4 font-medium">{t(`crop.${row.crop}`)}</th>
              <td className="max-w-60 px-4 py-4 text-xs text-muted-foreground">{row.result ? <>{t("econ.inputsSummary", { area: format(Number(row.input.area)), yield: format(Number(row.input.yield)), price: format(Number(row.input.price)) })}{examples[row.crop] ? <span className="mt-1 block">{t("econ.example")}</span> : null}</> : t("econ.incomplete")}</td>
              {[row.result?.revenue, row.result?.costs, row.result?.profit, row.result?.profitPerHa].map((value, index) => <td key={index} className={`whitespace-nowrap px-4 py-4 tabular-nums ${index >= 2 ? "font-semibold" : ""} ${typeof value === "number" && value < 0 ? "text-destructive" : ""}`}>{value === undefined ? "—" : money(value)}</td>)}
              <td className="px-3"><Button size="icon" variant="ghost" aria-label={`${t("econ.edit")} — ${t(`crop.${row.crop}`)}`} title={`${t("econ.edit")} — ${t(`crop.${row.crop}`)}`} onClick={() => { setCrop(row.crop); document.getElementById("assumptions-title")?.scrollIntoView({ block: "center" }); document.getElementById("economics-crop")?.focus({ preventScroll: true }); }}><Pencil aria-hidden /></Button></td>
            </tr>)}</tbody>
          </table>
        </div>
        <figure className="mt-7" aria-label={t("econ.chart")}>
          <figcaption className="mb-4 text-sm font-semibold">{t("econ.chart")}</figcaption>
          {validRows.length < 2 ? <p className="text-sm text-muted-foreground">{t("econ.chartEmpty")}</p> : <div className="max-w-3xl space-y-4">
            {validRows.map(row => { const profit = row.result?.profit ?? 0; return <div key={row.crop} className="grid gap-1 sm:grid-cols-[100px_1fr] sm:items-center sm:gap-4">
              <span className="text-sm">{t(`crop.${row.crop}`)}</span>
              <div><div className="grid h-6 grid-cols-2" aria-hidden>
                <div className="flex justify-end border-r border-border bg-muted">{profit < 0 ? <div className="h-6 bg-destructive" style={{ width: `${Math.abs(profit) / maximum * 100}%` }} /> : null}</div>
                <div className="bg-muted">{profit > 0 ? <div className="h-6 bg-primary" style={{ width: `${profit / maximum * 100}%` }} /> : null}</div>
              </div><p className="mt-1 text-xs tabular-nums">{money(profit)} · {t(`econ.${profit < 0 ? "loss" : profit > 0 ? "gain" : "balanced"}`)}</p></div>
            </div>; })}
          </div>}
        </figure>
      </section>
    </main>
    <Footer />
  </div>;
}
