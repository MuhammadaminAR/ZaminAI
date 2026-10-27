import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/navbar";
import { supabase } from "@/integrations/supabase/client";
import { Field } from "@/routes/login";
import { localizeError, useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — ZaminAI" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "description", content: "Choose a new password for your ZaminAI account." },
      { property: "og:title", content: "Set a new password — ZaminAI" },
      { property: "og:description", content: "Choose a new password for your ZaminAI account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setHasSession(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      const recovery = window.location.hash.includes("type=recovery");
      setHasSession(!!data.session || recovery);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="card-surface p-8">
          <h1 className="text-2xl font-semibold text-foreground">{t("auth.resetTitle")}</h1>
          {hasSession === false ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {t("auth.resetInvalid")}{" "}
              <Link to="/forgot-password" className="text-primary hover:underline">
                {t("auth.requestNew")}
              </Link>
            </p>
          ) : (
            <form
              className="mt-6 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                if (password.length < 8) return setError(t("auth.passwordShort8"));
                if (password !== confirm) return setError(t("auth.passwordsMismatch"));
                setBusy(true);
                const { error: err } = await supabase.auth.updateUser({ password });
                setBusy(false);
                if (err) return setError(localizeError(err.message, t));
                navigate({ to: "/dashboard", replace: true });
              }}
            >
              <Field label={t("auth.newPassword")} type="password" value={password} onChange={setPassword} />
              <Field label={t("auth.confirmPassword")} type="password" value={confirm} onChange={setConfirm} />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {busy ? t("auth.saving") : t("auth.updatePassword")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
