/**
 * Public origin used for email confirmation and OAuth redirects.
 * Set VITE_PUBLIC_APP_URL when a fixed public origin should be used.
 */
export function publicAppOrigin(): string {
  const configured = (import.meta.env["VITE_PUBLIC_APP_URL"] as string | undefined)?.replace(/\/+$/, "");
  if (typeof window === "undefined") return configured ?? "";
  return configured || window.location.origin;
}

export function authCallbackUrl() {
  return `${publicAppOrigin()}/auth/callback`;
}
