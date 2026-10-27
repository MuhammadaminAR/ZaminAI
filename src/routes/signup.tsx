import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Navbar } from "@/components/navbar";
import { signUp } from "@/lib/store";
import { localizeError, useLanguage } from "@/lib/i18n";
import { Field, GoogleButton, ResendButton } from "./login";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create your ZaminAI account" },
      {
        name: "description",
        content: "Create a free ZaminAI account and analyse your first field in minutes.",
      },
      { property: "og:title", content: "Create your ZaminAI account" },
      { property: "og:description", content: "Analyse your first field in minutes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="card-surface p-8">
          <h1 className="text-2xl font-semibold text-foreground">{t("auth.signupTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.signupSub")}</p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              setConfirm(false);
              if (fullName.trim().length < 2) return setError(t("auth.nameShort"));
              if (!email.includes("@")) return setError(t("auth.invalidEmail"));
              if (password.length < 6) return setError(t("auth.passwordShort6"));
              signUp(fullName.trim(), email.trim(), password)
                .then(({ needsConfirmation }) =>
                  needsConfirmation ? setConfirm(true) : navigate({ to: "/dashboard" }),
                )
                .catch((err: Error) => setError(localizeError(err.message, t)));
            }}
          >
            <Field label={t("auth.fullName")} value={fullName} onChange={setFullName} placeholder="Aziz Karimov" />
            <Field label={t("auth.email")} type="email" value={email} onChange={setEmail} placeholder="you@farm.uz" />
            <Field label={t("auth.password")} type="password" value={password} onChange={setPassword} placeholder="••••••••" />

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {confirm ? (
              <div className="space-y-2 rounded-lg bg-primary-soft p-3 text-sm text-primary">
                <p>{t("auth.signupCreated")}</p>
                <ResendButton email={email.trim()} />
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => {
                    setConfirm(false);
                    setEmail("");
                  }}
                >
                  {t("auth.changeEmail")}
                </button>
              </div>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {t("auth.createAccount")}
            </button>
          </form>

          <GoogleButton onError={setError} />

          <p className="mt-4 text-sm text-muted-foreground">
            {t("auth.haveAccount")}{" "}
            <Link to="/login" className="text-primary hover:underline">
              {t("auth.login")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
