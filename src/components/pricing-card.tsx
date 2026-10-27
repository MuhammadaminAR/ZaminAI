import { Link } from "@tanstack/react-router";
import type { PlanId } from "@/lib/types";
import { useLanguage } from "@/lib/i18n";

export interface Plan {
  id: PlanId;
  price: string;
  highlighted?: boolean;
}

export const plans: Plan[] = [
  { id: "free", price: "0" },
  { id: "professional", price: "149 000", highlighted: true },
  { id: "premium", price: "390 000" },
];

const FEATURE_COUNT: Record<PlanId, number> = { free: 5, professional: 6, premium: 5 };

export function PricingCard({
  plan,
  currentPlan,
  onSelect,
}: {
  plan: Plan;
  currentPlan?: PlanId | undefined;
  onSelect?: ((plan: Plan) => void) | undefined;
}) {
  const { t } = useLanguage();
  const isCurrent = currentPlan === plan.id;
  const features = Array.from({ length: FEATURE_COUNT[plan.id] }, (_, i) => t(`plan.${plan.id}.f${i + 1}`));

  return (
    <div
      className={`card-surface flex h-full flex-col p-6 ${
        plan.highlighted ? "border-primary ring-1 ring-primary/30" : ""
      }`}
    >
      {plan.highlighted ? (
        <span className="mb-3 inline-flex w-fit rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary">
          {t("plans.mostPopular")}
        </span>
      ) : null}
      <h3 className="text-lg font-semibold text-foreground">{t(`plan.${plan.id}.name`)}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t(`plan.${plan.id}.desc`)}</p>
      <p className="mt-4 text-3xl font-semibold text-foreground">
        {plan.price}
        <span className="ml-1 text-sm font-normal text-muted-foreground">{t("plans.perMonth")}</span>
      </p>

      <ul className="mt-5 space-y-2">
        {features.map((f) => (
          <li key={f} className="flex gap-2 text-sm text-foreground">
            <span className="text-primary">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-6">
        {onSelect ? (
          <button
            type="button"
            disabled={isCurrent}
            onClick={() => onSelect(plan)}
            className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              isCurrent
                ? "cursor-default bg-muted text-muted-foreground"
                : plan.highlighted
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border border-border bg-card text-foreground hover:bg-accent"
            }`}
          >
            {isCurrent ? t("plans.currentPlan") : plan.id === "free" ? t("plans.startFree") : t("plans.requestPlan")}
          </button>
        ) : (
          <Link
            to="/pricing"
            className="block w-full rounded-lg border border-border px-4 py-2.5 text-center text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("plans.viewDetails")}
          </Link>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t("plans.noPayments")}</p>
    </div>
  );
}
