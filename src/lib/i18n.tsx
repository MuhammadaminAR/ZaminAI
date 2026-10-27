import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { dictionaries, type Locale } from "./i18n/index";

export type { Locale };

export const LOCALES: { id: Locale; label: string }[] = [
  { id: "uz", label: "O‘zbekcha" },
  { id: "en", label: "English" },
  { id: "ru", label: "Русский" },
];

const STORAGE_KEY = "agroai-locale";
const DEFAULT_LOCALE: Locale = "uz";

function isLocale(v: unknown): v is Locale {
  return v === "uz" || v === "en" || v === "ru";
}

function storedLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(v) ? v : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Translate with {placeholder} interpolation. Uzbek is the final fallback for missing keys. */
export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  let s = dictionaries[locale][key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Hook-free translation for error boundaries and other places outside the provider. */
export function tStatic(key: string, vars?: Record<string, string | number>): string {
  return translate(storedLocale(), key, vars);
}

interface LanguageCtx {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Locale-aware short date, e.g. 19.10.2026. */
  fmtDate: (d: string | Date) => string;
  /** Locale-aware date + time. */
  fmtDateTime: (d: string | Date) => string;
}

const Ctx = createContext<LanguageCtx | null>(null);

const DATE_LOCALES: Record<Locale, string> = { uz: "uz-Latn-UZ", en: "en-GB", ru: "ru-RU" };

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Always start at the default so SSR and first client render match; the stored
  // preference is applied after hydration.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = storedLocale();
    if (stored !== DEFAULT_LOCALE) setLocaleState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "uz" ? "uz-Latn" : locale;
  }, [locale]);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* private mode — keep in-memory only */
    }
  };

  const value: LanguageCtx = {
    locale,
    setLocale,
    t: (key, vars) => translate(locale, key, vars),
    fmtDate: (d) => new Date(d).toLocaleDateString(DATE_LOCALES[locale]),
    fmtDateTime: (d) => new Date(d).toLocaleString(DATE_LOCALES[locale]),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLanguage(): LanguageCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLanguage must be used inside LanguageProvider");
  return ctx;
}

/** Map known server/backend error messages to localized, user-friendly text. */
export function localizeError(message: string, t: (k: string, v?: Record<string, string | number>) => string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return t("errors.invalidCredentials");
  if (m.includes("email not confirmed")) return t("errors.emailNotConfirmed");
  if (m.includes("user already registered") || m.includes("already been registered")) return t("errors.emailTaken");
  if (m.includes("too many") || m.includes("rate limit") || m.includes("429")) return t("errors.tooMany");
  if (m.includes("outside supported area") || m.includes("outside uzbekistan")) return t("errors.outsideUz");
  if (m.includes("not found") || m.includes("do not have access")) return t("errors.notFound");
  if (m.includes("quota") || m.includes("allowance") || m.includes("cooldown")) return t("errors.quota");
  if (m.includes("network") || m.includes("failed to fetch") || m.includes("load failed")) return t("errors.network");
  return message;
}
