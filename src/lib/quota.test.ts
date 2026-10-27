import { describe, expect, it } from "vitest";
import { canStartAnalysis, isCooldownActive, nextAvailableLabel, remainingLabel } from "./quota";
import type { QuotaStatus } from "./quota.functions";

const free = (over: Partial<QuotaStatus> = {}): QuotaStatus => ({
  plan: "free",
  unlimited: false,
  batch_size: 3,
  used: 0,
  remaining: 3,
  cooldown_until: null,
  next_available_at: null,
  ...over,
});

describe("quota display rules", () => {
  it("a new Free account can start with 3 of 3 remaining", () => {
    const q = free();
    expect(canStartAnalysis(q)).toBe(true);
    expect(remainingLabel(q)).toBe("3 of 3");
  });

  it("counts down within a batch", () => {
    expect(remainingLabel(free({ used: 1, remaining: 2 }))).toBe("2 of 3");
    expect(remainingLabel(free({ used: 2, remaining: 1 }))).toBe("1 of 3");
    expect(canStartAnalysis(free({ used: 2, remaining: 1 }))).toBe(true);
  });

  it("blocks during an active cooldown and exposes the next-available time", () => {
    const future = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const q = free({ used: 3, remaining: 0, cooldown_until: future, next_available_at: future });
    expect(isCooldownActive(q)).toBe(true);
    expect(canStartAnalysis(q)).toBe(false);
    expect(nextAvailableLabel(q)).toBeTruthy();
  });

  it("allows analysis again after the cooldown has elapsed", () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const q = free({ remaining: 3, cooldown_until: past });
    expect(isCooldownActive(q)).toBe(false);
    expect(canStartAnalysis(q)).toBe(true);
  });

  it("treats unlimited plans as always allowed", () => {
    const q = free({ plan: "professional", unlimited: true, batch_size: null, remaining: null });
    expect(canStartAnalysis(q)).toBe(true);
    expect(remainingLabel(q)).toBe("Unlimited analyses");
  });

  it("blocks when nothing remains even without a cooldown timestamp", () => {
    expect(canStartAnalysis(free({ remaining: 0 }))).toBe(false);
  });
});
