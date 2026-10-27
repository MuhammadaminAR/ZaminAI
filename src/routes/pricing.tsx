import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Footer, Navbar } from "@/components/navbar";
import { plans, PricingCard } from "@/components/pricing-card";
import { useSession } from "@/hooks/use-session";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — ZaminAI plans for farms and consultants" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content:
          "Compare the ZaminAI Free, Professional and Premium plans for land analysis and crop recommendations.",
      },
      { property: "og:title", content: "Pricing — ZaminAI" },
      {
        property: "og:description",
        content: "Free, Professional and Premium plans for land analysis in Uzbekistan.",
      },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold text-foreground">{t("plans.title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("plans.sub")}</p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <PricingCard
              key={plan.id}
              plan={plan}
              currentPlan={user?.plan}
              onSelect={(selected) => {
                if (!user) {
                  navigate({ to: "/signup" });
                  return;
                }
                if (selected.id === "free") {
                  navigate({ to: "/dashboard" });
                } else {
                  navigate({ to: "/contact", search: { plan: selected.id } });
                }
              }}
            />
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">{t("plans.whatCounts")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("plans.whatCounts1")}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t("plans.whatCounts2")}</p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
