const STATUS_NAMES = new Set([
  "INVALID_ARGUMENT", "FAILED_PRECONDITION", "PERMISSION_DENIED", "UNAUTHENTICATED",
  "NOT_FOUND", "RESOURCE_EXHAUSTED", "UNAVAILABLE", "INTERNAL", "DEADLINE_EXCEEDED",
  "OUT_OF_RANGE", "UNIMPLEMENTED", "CANCELLED", "UNKNOWN", "ABORTED", "ALREADY_EXISTS",
]);

/** Fail closed: retain only recognized diagnostic phrases, never arbitrary upstream text. */
function sanitizedMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const rules: [RegExp, string][] = [
    [/user location is not supported/i, "User location is not supported for the API use."],
    [/free tier.*not available.*country/i, "Free tier is not available in the country."],
    [/enable billing|billing.*(?:required|enabled|disabled)|paid plan/i, "Google project billing or a paid plan is required."],
    [/api key not valid|API_KEY_INVALID/i, "API key is not valid."],
    [/api key.*(?:expired|revoked)/i, "API key is expired or revoked."],
    [/API.*(?:not been used|disabled)|SERVICE_DISABLED/i, "Google project API is disabled or has not been enabled."],
    [/referer|referrer|IP address.*blocked|API_KEY_SERVICE_BLOCKED/i, "API key usage restrictions rejected the request."],
    [/response_?json_?schema|response_?schema|json schema/i, "Structured output schema was rejected."],
    [/invalid json payload|unknown name|cannot find field/i, "Invalid JSON payload or unsupported request field."],
    [/model.*(?:not found|not supported|not available)|not supported for.*generatecontent/i, "Model is unavailable or unsupported for this API method."],
    [/quota|rate limit|resource exhausted/i, "Google quota or request limit was reached."],
    [/permission denied|does not have permission/i, "Google denied permission for the request."],
  ];
  const phrases = rules.filter(([pattern]) => pattern.test(value)).map(([, phrase]) => phrase);
  return (phrases.length ? phrases.join(" ") : "Unrecognized upstream message; redacted.").slice(0, 240);
}

/** Only these four scalar fields may reach server logs; no SDK message fallback. */
export function geminiDiagnostics(error: unknown): {
  httpStatus: number | null; status: string | null; code: number | null; message: string | null;
} {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const e = current as { statusCode?: unknown; responseBody?: unknown; cause?: unknown };
    if (typeof e.statusCode === "number" && Number.isInteger(e.statusCode) && e.statusCode >= 100 && e.statusCode <= 599) {
      let upstream: Record<string, unknown> = {};
      if (typeof e.responseBody === "string" && e.responseBody.length <= 65_536) {
        try {
          const parsed: unknown = JSON.parse(e.responseBody);
          if (parsed && typeof parsed === "object" && "error" in parsed && parsed.error && typeof parsed.error === "object") {
            upstream = parsed.error as Record<string, unknown>;
          }
        } catch { /* Malformed bodies are never logged. */ }
      }
      return {
        httpStatus: e.statusCode,
        status: typeof upstream["status"] === "string" && STATUS_NAMES.has(upstream["status"]) ? upstream["status"] : null,
        code: typeof upstream["code"] === "number" && Number.isInteger(upstream["code"]) && upstream["code"] >= 100 && upstream["code"] <= 599 ? upstream["code"] : null,
        message: sanitizedMessage(upstream["message"]),
      };
    }
    current = e.cause;
  }
  return { httpStatus: null, status: null, code: null, message: null };
}