import { describe, expect, it, vi } from "vitest";
import { safeGeminiError } from "./gemini-errors";
import { createGeminiFetch } from "./gemini-fetch.server";
import { generateExplanation } from "../ai-agronomy.server";
import { geminiDiagnostics } from "./gemini-diagnostics.server";

describe("direct Gemini error safeguards", () => {
  it.each([401, 403, 404, 429, 503])("preserves status %s and never exposes provider diagnostics", (status) => {
    const error = safeGeminiError({ statusCode: status, message: "private upstream diagnostic", responseBody: "sensitive details" }, "uz");
    expect(error.status).toBe(status);
    expect(error.message).not.toContain("private");
    expect(error.message).not.toContain("sensitive");
    expect(error.message).not.toContain("credit limit or policy");
  });
  it("distinguishes authentication, access, model, quota and temporary failures", () => {
    expect(new Set([401, 403, 404, 429, 503].map((statusCode) => safeGeminiError({ statusCode }, "uz").message)).size).toBe(5);
  });
  it("recognizes Google's invalid-key 400 as authentication without forwarding its text", () => {
    expect(safeGeminiError({ statusCode: 400, message: "API key not valid. private details" }, "uz").message)
      .toBe(safeGeminiError({ statusCode: 401 }, "uz").message);
  });
  it("finds a wrapped SDK error status", () => {
    expect(safeGeminiError({ cause: { statusCode: 429 } }, "uz").status).toBe(429);
  });
});

describe("bounded pre-stream recovery", () => {
  it.each([400, 401, 403, 404, 429])("never retries terminal or quota HTTP %s", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
    const wait = vi.fn(async () => {});
    const result = await createGeminiFetch(fetcher, wait)("https://generativelanguage.googleapis.com/v1beta/models/example:streamGenerateContent");
    expect(result.status).toBe(status);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
  it("retries 503 only once after backoff even when the second request fails", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(null, { status: 503, headers: { "retry-after": "4" } }));
    const wait = vi.fn(async () => {});
    expect((await createGeminiFetch(fetcher, wait)("https://generativelanguage.googleapis.com")).status).toBe(503);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(4000);
  });
  it("does not queue a long Retry-After wait", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503, headers: { "retry-after": "120" } }));
    const wait = vi.fn(async () => {});
    await createGeminiFetch(fetcher, wait)("https://generativelanguage.googleapis.com");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
  it("never replays a successful stream or an ambiguous network failure", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("stream", { status: 200 }));
    await createGeminiFetch(fetcher)("https://generativelanguage.googleapis.com");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const broken = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    await expect(createGeminiFetch(broken)("https://generativelanguage.googleapis.com")).rejects.toThrow();
    expect(broken).toHaveBeenCalledTimes(1);
  });
});

describe("SDK direct Google boundary", () => {
  it.each([401, 403, 404, 429])("surfaces safe HTTP %s through the real SDK without retries or Gateway traffic", async (status) => {
    const calls: string[] = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      calls.push(url.hostname);
      expect(url.searchParams.has("key")).toBe(false);
      expect(new Headers(init?.headers).has("x-goog-api-key")).toBe(true);
      return new Response(JSON.stringify({ error: { code: status, message: "private diagnostic", status: status === 429 ? "RESOURCE_EXHAUSTED" : "PERMISSION_DENIED" } }), { status, headers: { "content-type": "application/json" } });
    });
    vi.stubEnv("GEMINI_API_KEY", "test-credential");
    vi.stubGlobal("fetch", fetcher);
    const logging = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(generateExplanation({ crops: [] }, "uz")).rejects.toMatchObject({ status, message: safeGeminiError({ statusCode: status }, "uz").message });
      expect(calls).toEqual(["generativelanguage.googleapis.com"]);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(logging).toHaveBeenCalledWith("ai-agronomy-explanation Gemini failed", status, {
        httpStatus: status, code: status,
        status: status === 429 ? "RESOURCE_EXHAUSTED" : "PERMISSION_DENIED",
        message: "Unrecognized upstream message; redacted.",
      });
    } finally {
      logging.mockRestore();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});

describe("server-only Gemini diagnostics", () => {
  it("captures a wrapped Google project prerequisite without copying private text", () => {
    const result = geminiDiagnostics({ cause: { statusCode: 400, responseBody: JSON.stringify({ error: {
      code: 400, status: "FAILED_PRECONDITION",
      message: "Free tier is not available in your country. Please enable billing. private-person@example.test secret-placeholder",
      details: [{ requestBody: "private soil assessment" }],
    } }), requestHeaders: { authorization: "private-header" } } });
    expect(result).toEqual({ httpStatus: 400, code: 400, status: "FAILED_PRECONDITION",
      message: "Free tier is not available in the country. Google project billing or a paid plan is required." });
  });
  it("retains only canonical schema diagnostics and limits messages to 240 characters", () => {
    const result = geminiDiagnostics({ statusCode: 400, responseBody: JSON.stringify({ error: {
      code: 400, status: "INVALID_ARGUMENT", message: "responseJsonSchema invalid JSON payload " + "private soil prompt ".repeat(100),
    } }) });
    expect(result.message).toBe("Structured output schema was rejected. Invalid JSON payload or unsupported request field.");
    expect(result.message?.length).toBeLessThanOrEqual(240);
  });
  it("never falls back to SDK messages or logs malformed bodies", () => {
    expect(geminiDiagnostics({ statusCode: 400, message: "private-sdk-message", responseBody: "not JSON: private" }))
      .toEqual({ httpStatus: 400, code: null, status: null, message: null });
  });
  it("rejects arbitrary status, code and message content", () => {
    expect(geminiDiagnostics({ statusCode: 400, responseBody: JSON.stringify({ error: {
      code: "private-code", status: "PRIVATE_STATUS", message: "private-person@example.test private prompt",
    } }) })).toEqual({ httpStatus: 400, code: null, status: null, message: "Unrecognized upstream message; redacted." });
  });
});