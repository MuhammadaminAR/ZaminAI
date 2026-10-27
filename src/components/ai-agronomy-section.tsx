import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { aiAgronomyExplanation } from "@/lib/ai-agronomy.functions";
import { sourceVersion, type AssessmentRow, type SavedExplanationContent } from "@/lib/ai-agronomy/context";
import { localizeError, useLanguage } from "@/lib/i18n";

interface Row { id: string; assessment_id: string; source_version: string; model: string; provider: string; language: string; created_at: string; content: SavedExplanationContent }

export function AiAgronomySection({ analysisId, assessment }: { analysisId: string; assessment: AssessmentRow }) {
  const gen = useServerFn(aiAgronomyExplanation);
  const { t, locale, fmtDateTime } = useLanguage();
  const [row, setRow] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const version = sourceVersion(assessment);

  useEffect(() => {
    supabase.from("ai_agronomy_explanations").select("*").eq("analysis_request_id", analysisId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setRow((data as unknown as Row) ?? null));
  }, [analysisId, assessment.id]);

  const current = row && row.assessment_id === assessment.id && row.source_version === version;
  const outdated = row && !current;
  // A saved explanation in another language is shown as-is, never presented as translated.
  const langMismatch = current && row && row.language && row.language !== locale;

  const run = async () => {
    setBusy(true); setErr(null);
    try { setRow((await gen({ data: { analysisId, assessmentId: assessment.id, language: locale } })) as unknown as Row); }
    catch (e) { setErr(e instanceof Error ? localizeError(e.message, t) : t("ai.failed")); }
    finally { setBusy(false); }
  };

  const names = new Map(assessment.crops.map((c) => [c.slug, c]));
  const c = current && row ? row.content : null;
  const meta = row;

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">{t("ai.title")}</h2>
        <span className="text-xs text-muted-foreground">{t("ai.subtitle")}</span>
      </div>
      <div className="mt-4 card-surface p-5">
        {outdated ? <p className="mb-3 text-sm text-muted-foreground">{t("ai.outdated")}</p> : null}
        {langMismatch ? (
          <div className="mb-3 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            {t("ai.langMismatch", { lang: t(`ai.langName.${row.language}`) })}
          </div>
        ) : null}
        {!c || langMismatch ? (
          <button type="button" onClick={run} disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {busy ? t("ai.generating") : err ? t("ai.retry") : langMismatch ? t("ai.regenerateLang", { lang: t(`ai.langName.${locale}`) }) : t("ai.generate")}
          </button>
        ) : null}
        {err ? <p className="mt-2 text-sm text-destructive">{err} {t("ai.unaffected")}</p> : null}
        {c && meta ? (
          <div className="mt-4 space-y-5 text-sm">
            {c.salinity_blocked ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">
                {t("ai.salinityBlocked")}
              </div>
            ) : null}
            <Block title={t("ai.overall")}>
              <p className="text-foreground">{c.overall.summary}</p>
              <p className="mt-1 text-muted-foreground">{c.overall.support}</p>
              <L title={t("ai.keyLimitations")} items={c.overall.key_limitations} />
            </Block>
            <Block title={t("ai.byCrops")}>
              <ol className="grid gap-3 lg:grid-cols-2">
                {c.crops.map((x) => {
                  const cr = names.get(x.slug);
                  return (
                    <li key={x.slug} className="rounded-lg border border-border p-3">
                      <p className="font-medium text-foreground">#{cr?.rank} {cr ? t(`crop.${cr.slug}`) : x.slug} <span className="font-normal text-muted-foreground">· {cr?.score ?? "—"}{cr?.score != null ? "/100" : ""} {t("ai.ruleBased")}</span></p>
                      <p className="mt-1 text-muted-foreground">{x.why_this_score}</p>
                      <L title={t("ai.favorable")} items={x.favorable} />
                      <L title={t("ai.risks")} items={x.risks} />
                      <L title={t("ai.missingInfo")} items={x.missing_info} />
                    </li>
                  );
                })}
              </ol>
            </Block>
            <Block title={t("ai.water")}>
              <p className="text-muted-foreground">{c.water.explanation}</p>
              <L title={t("ai.unknowns")} items={c.water.unknowns} />
            </Block>
            <Block title={t("ai.nextSteps")}><L items={c.next_actions} /></Block>
            <Block title={t("ai.sources")}>
              <L items={c.transparency.sources} />
              <p className="mt-1 text-muted-foreground">{c.transparency.predicted_vs_measured}</p>
              <L title={t("ai.missingVars")} items={c.transparency.missing_variables} />
            </Block>
            <p className="text-xs text-muted-foreground">
              {t("ai.footer", { date: fmtDateTime(meta.created_at), model: meta.model, id: meta.assessment_id.slice(0, 8), version: meta.source_version })}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h3 className="text-sm font-semibold text-foreground">{title}</h3><div className="mt-1">{children}</div></div>;
}
function L({ title, items }: { title?: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-2">
      {title ? <p className="text-xs font-medium text-foreground">{title}</p> : null}
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">{items.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  );
}
