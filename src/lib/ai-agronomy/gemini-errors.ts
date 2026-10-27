import type { ExplanationLanguage } from "./context";

export type GeminiFailure = "configuration" | "authentication" | "access" | "quota" | "model" | "request" | "temporary" | "invalid" | "refusal";
export class AiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const messages: Record<ExplanationLanguage, Record<GeminiFailure, string>> = {
  uz: {
    configuration: "Gemini yordamchisi sozlanmagan. Loyiha egasi saqlangan API kalitini tekshirishi kerak.",
    authentication: "Gemini kaliti tasdiqlanmadi. Loyiha egasi kalit sozlamalarini tekshirishi kerak.",
    access: "Google bu so‘rovga ruxsat bermadi. Loyiha egasi Gemini ruxsatlarini tekshirishi kerak.",
    quota: "Gemini so‘rov limiti yoki kvotasi tugagan. Biroz kuting; muammo davom etsa, loyiha egasi Google kvotasini tekshirsin.",
    model: "Tanlangan Gemini modeli hozir mavjud emas. Loyiha egasi model mavjudligini tekshirishi kerak.",
    request: "Gemini so‘rovni qabul qilmadi. Loyiha egasi yordamchi sozlamalarini tekshirishi kerak.",
    temporary: "Gemini xizmati bilan vaqtinchalik aloqa muammosi. Birozdan keyin qayta urinib ko‘ring.",
    invalid: "Gemini to‘liq va yaroqli tushuntirish qaytarmadi. Tushuntirish saqlanmadi.",
    refusal: "Google bu so‘rov uchun tushuntirish berishni rad etdi. Tushuntirish saqlanmadi.",
  },
  en: {
    configuration: "Gemini is not configured. The project owner needs to check the saved API key.",
    authentication: "Gemini could not validate the key. The project owner needs to check its configuration.",
    access: "Google denied this request. The project owner needs to check Gemini permissions.",
    quota: "Gemini's request limit or quota has been reached. Wait before trying again; the project owner may need to check Google quota.",
    model: "The selected Gemini model is currently unavailable. The project owner needs to check model availability.",
    request: "Gemini rejected the request. The project owner needs to check the assistant configuration.",
    temporary: "There is a temporary connection problem with Gemini. Try again later.",
    invalid: "Gemini did not return a complete valid explanation. Nothing was saved.",
    refusal: "Google declined to explain this request. Nothing was saved.",
  },
  ru: {
    configuration: "Gemini не настроен. Владельцу проекта нужно проверить сохранённый API-ключ.",
    authentication: "Gemini не подтвердил ключ. Владельцу проекта нужно проверить настройки ключа.",
    access: "Google отказал в доступе к этому запросу. Владельцу проекта нужно проверить разрешения Gemini.",
    quota: "Достигнут лимит запросов или квота Gemini. Подождите; если проблема остаётся, владельцу проекта нужно проверить квоту Google.",
    model: "Выбранная модель Gemini сейчас недоступна. Владельцу проекта нужно проверить её доступность.",
    request: "Gemini отклонил запрос. Владельцу проекта нужно проверить настройки помощника.",
    temporary: "Временная проблема связи с Gemini. Повторите попытку позже.",
    invalid: "Gemini не вернул полное корректное пояснение. Ничего не сохранено.",
    refusal: "Google отказался пояснять этот запрос. Ничего не сохранено.",
  },
};

export function geminiError(kind: GeminiFailure, status: number, language: ExplanationLanguage) {
  return new AiError(messages[language][kind], status);
}

/** Never forward provider messages, response bodies, headers or request URLs. */
export function safeGeminiError(error: unknown, language: ExplanationLanguage): AiError {
  if (error instanceof AiError) return error;
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const e = current as { statusCode?: number; cause?: unknown; message?: string };
    const status = e.statusCode;
    if (status !== undefined) {
      const kind: GeminiFailure = status === 401 || (status === 400 && /API_KEY_INVALID|API key not valid/i.test(e.message ?? ""))
        ? "authentication" : status === 403 ? "access" : status === 429 ? "quota"
        : status === 404 ? "model" : status >= 500 ? "temporary" : "request";
      return geminiError(kind, status, language);
    }
    current = e.cause;
  }
  return geminiError("invalid", 502, language);
}