import { describe, expect, it } from "vitest";
import { mapFailureKind, mapRetryDelay } from "./map-recovery";

describe("map recovery", () => {
  it("keeps a failed satellite tile nonfatal even during initial load", () => {
    expect(mapFailureKind({ url: "https://api.mapbox.com/v4/mapbox.satellite/6/44/23.webp" })).toBe("partial");
  });
  it("keeps source failures nonfatal and treats root style failure separately", () => {
    expect(mapFailureKind({}, "satellite")).toBe("partial");
    expect(mapFailureKind({ url: "https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12" })).toBe("fatal");
  });
  it("bounds default manual retry backoff", () => {
    expect([1, 2, 3, 4, 10].map(n => mapRetryDelay(n))).toEqual([60_000, 120_000, 240_000, 300_000, 300_000]);
  });
  it("never retries before a supplied Retry-After delay or date", () => {
    expect(mapRetryDelay(1, "600", 0)).toBe(600_000);
    expect(mapRetryDelay(1, "Thu, 01 Jan 1970 00:10:00 GMT", 0)).toBe(600_000);
    expect(mapRetryDelay(1, "invalid", 0)).toBe(60_000);
  });
});