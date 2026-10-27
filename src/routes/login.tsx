import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Navbar } from "@/components/navbar";
import { EmailNotConfirmedError, loadUser, resendConfirmation, signIn } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { localizeError, useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — ZaminAI" },
      { name: "description", content: "Log in to your ZaminAI account to analyse your land." },
      { property: "og:title", content: "Log in — ZaminAI" },
      { property: "og:description", content: "Log in to your ZaminAI account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="card-surface p-8">
          <h1 className="text-2xl font-semibold text-foreground">{t("auth.loginTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.loginSub")}</p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              setUnconfirmed(false);
              if (!email.includes("@")) return setError(t("auth.invalidEmail"));
              if (password.length < 6) return setError(t("auth.passwordShort6"));
              setBusy(true);
              signIn(email.trim(), password)
                .then(async () => {
                  // Admins land on the admin dashboard; everyone else on the farmer dashboard.
                  const { data } = await supabase.auth.getUser();
                  const u = data.user ? await loadUser(data.user.id).catch(() => null) : null;
                  navigate({ to: u && (u.role === "admin" || u.role === "super_admin") ? "/admin" : "/dashboard" });
                })
                .catch((err: Error) => {
                  if (err instanceof EmailNotConfirmedError) setUnconfirmed(true);
                  setError(localizeError(err.message, t));
                })
                .finally(() => setBusy(false));
            }}
          >
            <Field label={t("auth.email")} type="email" value={email} onChange={setEmail} placeholder="you@farm.uz" />
            <Field label={t("auth.password")} type="password" value={password} onChange={setPassword} placeholder="••••••••" />

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {unconfirmed ? <ResendButton email={email.trim()} /> : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? t("auth.loggingIn") : t("auth.login")}
            </button>
          </form>

          <div className="mt-4 flex justify-between text-sm">
            <Link to="/forgot-password" className="text-primary hover:underline">
              {t("auth.forgotPassword")}
            </Link>
            <Link to="/signup" className="text-primary hover:underline">
              {t("auth.createAccount")}
            </Link>
          </div>

          <GoogleButton onError={setError} />
        </div>
      </div>
    </div>
  );
}

export function ResendButton({ email }: { email: string }) {
  const { t } = useLanguage();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="text-sm">
      <button
        type="button"
        disabled={busy || !email}
        onClick={async () => {
          setBusy(true);
          setNote(null);
          try {
            await resendConfirmation(email);
            setNote(t("auth.resent"));
          } catch (e) {
            setNote(localizeError((e as Error).message, t));
          } finally {
            setBusy(false);
          }
        }}
        className="text-primary hover:underline disabled:opacity-60"
      >
        {busy ? t("auth.sending") : t("auth.resend")}
      </button>
      {note ? <p className="mt-1 text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  const shared =
    "mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/20";
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {textarea ? (
        <textarea
          rows={4}
          value={value}
          placeholder={placeholder}
          maxLength={1000}
          onChange={(e) => onChange(e.target.value)}
          className={shared}
        />
      ) : (
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          maxLength={255}
          onChange={(e) => onChange(e.target.value)}
          className={shared}
        />
      )}
    </label>
  );
}

export function GoogleButton({ onError }: { onError: (msg: string) => void }) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          const { data, error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo: `${window.location.origin}/auth/callback`,
            },
          });
          if (error) {
            console.warn("[google oauth]", error.message);
            onError(t("auth.googleError"));
            return;
          }
          if (data.url) window.location.assign(data.url);
        } catch (e) {
          console.warn("[google oauth]", e);
          onError(t("auth.googleError"));
        }
      }}
      className="mt-4 w-full rounded-lg border border-input bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
    >
      {t("auth.google")}
    </button>
  );
}
