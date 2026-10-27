import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Calculator, MapPin } from "lucide-react";
import heroImage from "@/assets/hero-farmland.jpg";
import { CropRecommendationCard } from "@/components/crop-card";
import { Footer, Navbar } from "@/components/navbar";
import { plans, PricingCard } from "@/components/pricing-card";
import { buildAnalysis } from "@/lib/mock-engine";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ZaminAI — Understand your soil. Choose the right crops." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "description",
        content:
          "ZaminAI gives farmers in Uzbekistan soil insights and crop comparisons for any location on the map.",
      },
      { property: "og:title", content: "ZaminAI — Understand your soil. Choose the right crops." },
      {
        property: "og:description",
        content:
          "Soil insights and crop comparisons for any field in Uzbekistan.",
      },
    ],
  }),
  component: Landing,
});

const sampleAnalysis = buildAnalysis({
  id: "sample",
  userId: "sample",
  farmName: "Example field",
  location: { id: "sample", lat: 41.31, lng: 69.28, region: "Tashkent city" },
});

const FEATURE_ICONS = ["🧪", "🌦️", "🌾", "🗺️"];

function Landing() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const { t } = useLanguage();

  const features = FEATURE_ICONS.map((icon, i) => ({
    icon,
    title: t(`home.f${i + 1}Title`),
    text: t(`home.f${i + 1}Text`),
    badge: i === 1 ? t("home.f2Badge") : null,
  }));
  const steps = [1, 2, 3].map((n) => ({ n, title: t(`home.s${n}Title`), text: t(`home.s${n}Text`) }));
  const faqs = [1, 2, 3, 4, 5].map((n) => ({ q: t(`home.q${n}`), a: t(`home.a${n}`) }));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <section className="border-b border-border bg-card">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div>
            <h1 className=" text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
              {t("home.heroTitle")}
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted-foreground">{t("home.heroText")}</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col rounded-xl border border-border bg-background p-5">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary-soft text-primary" aria-hidden>
                  <MapPin className="h-5 w-5" />
                </span>
                <p className="mt-4 text-base font-semibold text-foreground">{t("home.soilTitle")}</p>
                <p className="mt-1 flex-1 text-sm text-muted-foreground">{t("home.soilText")}</p>
                <Link
                  to="/analyze"
                  className="mt-4 rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {t("home.soilCta")}
                </Link>
              </div>
              <div className="flex flex-col rounded-xl border border-border bg-background p-5">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary-soft text-primary" aria-hidden>
                  <Calculator className="h-5 w-5" />
                </span>
                <p className="mt-4 text-base font-semibold text-foreground">{t("home.econTitle")}</p>
                <p className="mt-1 flex-1 text-sm text-muted-foreground">{t("home.econText")}</p>
                <Link
                  to="/economics"
                  className="mt-4 rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {t("home.econCta")}
                </Link>
              </div>
            </div>
          </div>
          <img
            src={heroImage}
            alt={t("home.heroAlt")}
            width={1600}
            height={1104}
            className="w-full rounded-xl border border-border object-cover"
          />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold text-foreground">{t("home.featuresTitle")}</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="card-surface p-5">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary-soft text-lg">
                {f.icon}
              </span>
              <h3 className="mt-4 flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
                {f.title}
                {f.badge ? (
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
                    {f.badge}
                  </span>
                ) : null}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold text-foreground">{t("home.stepsTitle")}</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="rounded-xl border border-border p-6">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {s.n}
                </span>
                <h3 className="mt-4 text-base font-semibold text-foreground">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">{t("home.exampleTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("home.exampleText")}</p>
          </div>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {sampleAnalysis.recommendations.slice(0, 3).map((rec) => (
            <CropRecommendationCard key={rec.cropId} rec={rec} />
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-2xl font-semibold text-foreground">{t("home.plansTitle")}</h2>
            <Link to="/pricing" className="text-sm font-medium text-primary hover:underline">
              {t("home.comparePlans")}
            </Link>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <PricingCard key={plan.id} plan={plan} />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold text-foreground">{t("home.faqTitle")}</h2>
        <div className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
          {faqs.map((f, i) => (
            <div key={f.q}>
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <span className="text-sm font-medium text-foreground">{f.q}</span>
                <span className="text-muted-foreground">{openFaq === i ? "−" : "+"}</span>
              </button>
              {openFaq === i ? (
                <p className="px-5 pb-4 text-sm text-muted-foreground">{f.a}</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
