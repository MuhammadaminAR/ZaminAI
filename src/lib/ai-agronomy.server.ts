import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Output, streamText } from "ai";
import { explanationSchema, LANGUAGE_DIRECTIVE, SYSTEM_PROMPT, type Explanation, type ExplanationLanguage } from "./ai-agronomy/context";
import { geminiError, safeGeminiError } from "./ai-agronomy/gemini-errors";
import { createGeminiFetch } from "./ai-agronomy/gemini-fetch.server";
import { geminiDiagnostics } from "./ai-agronomy/gemini-diagnostics.server";

export const AI_PROVIDER = "google-gemini";
export const AI_MODEL = "gemini-3.5-flash-lite";

/** Direct Google streaming inference; the key and all provider details stay server-side. */
export async function generateExplanation(context: unknown, language: ExplanationLanguage = "uz"): Promise<Explanation> {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw geminiError("configuration", 500, language);
  const provider = createGoogleGenerativeAI({ apiKey, fetch: createGeminiFetch() });
  let streamErr: unknown = null;
  const result = streamText({
    model: provider(AI_MODEL),
    instructions: `${SYSTEM_PROMPT}\n\n${LANGUAGE_DIRECTIVE[language]}`,
    messages: [{ role: "user", content: `Quyidagi saqlangan baholashni tushuntiring (JSON):\n${JSON.stringify(context)}` }],
    output: Output.object({ schema: explanationSchema }),
    maxRetries: 0, // Our fetch wrapper owns the single pre-stream 5xx retry; no quota retries.
    onError: ({ error }) => { streamErr = error; },
  });
  try {
    const out = await result.output;
    if (streamErr) throw streamErr;
    if (await result.finishReason === "content-filter") throw geminiError("refusal", 403, language);
    if (!out) throw geminiError("invalid", 502, language);
    return explanationSchema.parse(out);
  } catch (e) {
    const safe = safeGeminiError(streamErr ?? e, language);
    // Raw SDK errors can contain request headers or credentials; never log them.
    console.error("ai-agronomy-explanation Gemini failed", safe.status, geminiDiagnostics(streamErr ?? e));
    throw safe;
  }
}
