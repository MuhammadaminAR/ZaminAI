export type Locale = "uz" | "en" | "ru";
import { common } from "./common";
import { home } from "./home";
import { auth } from "./auth";
import { plans } from "./plans";
import { dashboard } from "./dashboard";
import { analyze } from "./analyze";
import { results } from "./results";
import { ai } from "./ai";
import { admin } from "./admin";
import { economics } from "./economics";

const parts = [common, home, auth, plans, dashboard, analyze, results, ai, admin, economics];

export const dictionaries: Record<Locale, Record<string, string>> = {
  uz: Object.assign({}, ...parts.map((p) => p.uz)),
  en: Object.assign({}, ...parts.map((p) => p.en)),
  ru: Object.assign({}, ...parts.map((p) => p.ru)),
};
