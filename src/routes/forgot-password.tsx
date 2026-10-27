import { createFileRoute, Link } from "@tanstack/react-router";
import { publicAppOrigin } from "@/lib/app-url";
import { useState } from "react";
import { Navbar } from "@/components/navbar";
import { supabase } from "@/integrations/supabase/client";
import { Field } from "@/routes/login";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — ZaminAI" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "description", content: "Request a password reset link for your ZaminAI account." },
      { property: "og:title", content: "Reset your password — ZaminAI" },
      { property: "og:description", content: "Request a password reset link." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="card-surface p-8">
          <h1 className="text-2xl font-semibold text-foreground">{t("auth.forgotTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.forgotSub")}</p>

          {sent ? (
            <div className="mt-6 rounded-lg bg-primary-soft p-4 text-sm text-primary">
              {t("auth.resetSent", { email })}
            </div>
          ) : (
            <form
              className="mt-6 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!email.includes("@")) return;
                await supabase.auth.resetPasswordForEmail(email, {
                  redirectTo: `${publicAppOrigin()}/reset-password`,
                });
                setSent(true);
              }}
            >
              <Field label={t("auth.email")} type="email" value={email} onChange={setEmail} placeholder="you@farm.uz" />
              <button
                type="submit"
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {t("auth.sendReset")}
              </button>
            </form>
          )}

          <p className="mt-4 text-sm text-muted-foreground">
            <Link to="/login" className="text-primary hover:underline">
              {t("auth.backToLogin")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
