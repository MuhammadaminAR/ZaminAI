import type { QuotaStatus } from "./quota.functions";

/** Pure display helpers for the Free-plan allowance. Server values are authoritative. */

export function isCooldownActive(q: QuotaStatus, now: Date = new Date()): boolean {
  return !!q.cooldown_until && new Date(q.cooldown_until).getTime() > now.getTime();
}

export function canStartAnalysis(q: QuotaStatus, now: Date = new Date()): boolean {
  if (q.unlimited) return true;
  if (isCooldownActive(q, now)) return false;
  return (q.remaining ?? 0) > 0;
}

/** "2 of 3" style label for the current batch. */
export function remainingLabel(q: QuotaStatus): string {
  if (q.unlimited) return "Unlimited analyses";
  return `${q.remaining ?? 0} of ${q.batch_size ?? 0}`;
}

/** Exact localized date-time for the next allowance. */
export function nextAvailableLabel(q: QuotaStatus, locale = "en-GB"): string | null {
  const at = q.next_available_at ?? q.cooldown_until;
  if (!at) return null;
  return new Date(at).toLocaleString(locale, {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}
