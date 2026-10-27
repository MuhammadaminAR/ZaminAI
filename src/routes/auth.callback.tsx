import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Navbar } from "@/components/navbar";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Signing you in — ZaminAI" },
      { name: "description", content: "Completing email verification or sign-in for ZaminAI." },
      { property: "og:title", content: "Signing you in — ZaminAI" },
      { property: "og:description", content: "Completing sign-in for ZaminAI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthCallbackPage,
});

type State = "working" | "verified_session" | "verified_no_session" | "error";

/** Single callback for email confirmation links and OAuth returns. */
function AuthCallbackPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [state, setState] = useState<State>("working");
  const [message, setMessage] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const errDesc =
      url.searchParams.get("error_description") ?? hash.get("error_description");
    const errCode = url.searchParams.get("error_code") ?? hash.get("error_code");
    const isSignupConfirm =
      hash.get("type") === "signup" || url.searchParams.get("type") === "signup";

    const finish = (s: State, msg?: string) => {
      if (done.current) return;
      done.current = true;
      setState(s);
      if (msg) setMessage(msg);
      if (s === "verified_session") {
        window.history.replaceState(null, "", "/auth/callback");
        setTimeout(() => navigate({ to: "/dashboard", replace: true }), 1200);
      }
    };

    if (errDesc || errCode) {
      console.warn("[auth callback]", errCode, errDesc);
      finish(
        "error",
        errCode === "otp_expired" ? t("auth.cbExpired") : t("auth.cbFailed"),
      );
      return;
    }

    const run = async () => {
      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) console.warn("[auth callback] code exchange", error.message);
      }
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        finish("verified_session", isSignupConfirm ? t("auth.cbVerified") : t("auth.cbSignedIn"));
      } else if (isSignupConfirm) {
        finish("verified_no_session", t("auth.cbVerifiedLogin"));
      } else {
        // give the client a moment to read tokens from the URL fragment
        setTimeout(async () => {
          const again = await supabase.auth.getUser();
          if (again.data.user) finish("verified_session", t("auth.cbSignedIn"));
          else finish("error", t("auth.cbFailed"));
        }, 1500);
      }
    };
    void run();
    // t is stable enough for this one-shot flow; messages are captured at finish time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="card-surface p-8 text-center">
          {state === "working" ? (
            <p className="text-sm text-muted-foreground">{t("auth.cbWorking")}</p>
          ) : state === "error" ? (
            <>
              <h1 className="text-xl font-semibold text-foreground">{t("auth.cbError")}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{message}</p>
              <Link to="/login" className="mt-6 inline-block rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
                {t("auth.cbGoLogin")}
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-foreground">{message}</h1>
              {state === "verified_session" ? (
                <p className="mt-2 text-sm text-muted-foreground">{t("auth.cbToDashboard")}</p>
              ) : (
                <Link to="/login" className="mt-6 inline-block rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
                  {t("auth.cbContinueLogin")}
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
