import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Footer, Navbar } from "@/components/navbar";
import { useSession } from "@/hooks/use-session";
import { plans } from "@/components/pricing-card";
import { listMyUpgradeRequests, submitUpgradeRequest } from "@/lib/quota.functions";
import { useServerFn } from "@tanstack/react-start";
import { Field } from "./login";
import { localizeError, useLanguage } from "@/lib/i18n";

type Search = { plan?: string | undefined };

export const Route = createFileRoute("/contact")({
  validateSearch: (search: Record<string, unknown>): Search => {
    const value = search["plan"];
    return typeof value === "string" ? { plan: value } : {};
  },
  head: () => ({
    meta: [
      { title: "Contact sales & request a plan — ZaminAI" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content:
          "Tell us about your farm or business and request an ZaminAI Professional or Premium plan.",
      },
      { property: "og:title", content: "Contact sales — ZaminAI" },
      { property: "og:description", content: "Request a plan for your farm or business." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { plan: planParam } = Route.useSearch();
  const { user } = useSession();
  const { t, fmtDate } = useLanguage();
  const submitRequest = useServerFn(submitUpgradeRequest);
  const fetchMyRequests = useServerFn(listMyUpgradeRequests);
  const [form, setForm] = useState({
    name: "",
    email: "",
    organisation: "",
    region: "",
    hectares: "",
    phone: "",
    message: "",
  });
  const [plan, setPlanChoice] = useState(planParam ?? "professional");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRequest, setPendingRequest] = useState<{ requested_plan: string; status: string; created_at: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchMyRequests()
      .then((rows) => {
        const open = rows.find((r) => r.status === "pending" || r.status === "contacted");
        setPendingRequest(open ?? null);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="card-surface p-8">
          <h1 className="text-2xl font-semibold text-foreground">{t("contact.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("contact.sub")}</p>

          {sent ? (
            <div className="mt-6 rounded-lg bg-primary-soft p-5 text-sm text-primary">
              {t("contact.sent", { email: user?.email ?? form.email })}
            </div>
          ) : !user ? (
            <div className="mt-6 rounded-lg border border-border bg-muted p-5 text-sm text-foreground">
              <p>{t("contact.loginPrompt")}</p>
              <Link
                to="/login"
                className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                {t("contact.loginCta")}
              </Link>
            </div>
          ) : pendingRequest ? (
            <div className="mt-6 rounded-lg border border-border bg-muted p-5 text-sm text-foreground">
              <p className="font-medium">{t("contact.pendingTitle")}</p>
              <p className="mt-1 text-muted-foreground">
                {t("contact.pendingText", {
                  plan: t(`plan.${pendingRequest.requested_plan}.name`),
                  status: t(`reqStatus.${pendingRequest.status}`),
                  date: fmtDate(pendingRequest.created_at),
                })}
              </p>
            </div>
          ) : (
            <form
              className="mt-6 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                if (form.message.trim().length < 5)
                  return setError(t("contact.messageShort"));
                setBusy(true);
                try {
                  await submitRequest({
                    data: {
                      plan: plan === "premium" ? "premium" : "professional",
                      message: form.message.trim(),
                      phone: form.phone.trim(),
                    },
                  });
                  setSent(true);
                } catch (err) {
                  setError(localizeError((err as Error).message, t));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                {t("contact.requestingAs", {
                  name: user.fullName || user.email,
                  email: user.email,
                  plan: t(`plan.${user.plan}.name`),
                })}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t("contact.phone")}
                  value={form.phone}
                  onChange={set("phone")}
                  placeholder="+998 90 123 45 67"
                />
                <label className="block">
                  <span className="text-sm font-medium text-foreground">{t("contact.requestedPlan")}</span>
                  <select
                    value={plan}
                    onChange={(e) => setPlanChoice(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  >
                    {plans
                      .filter((p) => p.id !== "free")
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {t(`plan.${p.id}.name`)}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              <Field
                label={t("contact.message")}
                textarea
                value={form.message}
                onChange={set("message")}
                placeholder={t("contact.messagePlaceholder")}
              />

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {busy ? t("contact.sending") : t("contact.submit")}
              </button>
            </form>
          )}
        </div>

        <aside className="space-y-4">
          <div className="card-surface p-6">
            <h2 className="text-base font-semibold text-foreground">{t("contact.selectedPlan")}</h2>
            <p className="mt-1 text-sm capitalize text-muted-foreground">{t(`plan.${plan}.name`)}</p>
            <ul className="mt-4 space-y-2">
              {Array.from({ length: plan === "premium" ? 5 : 6 }, (_, i) => t(`plan.${plan}.f${i + 1}`)).map((f) => (
                <li key={f} className="flex gap-2 text-sm text-foreground">
                  <span className="text-primary">✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="card-surface p-6 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">{t("contact.preferTalk")}</p>
            <p className="mt-2">{t("contact.preferTalkText")}</p>
          </div>
        </aside>
      </div>
      <Footer />
    </div>
  );
}
