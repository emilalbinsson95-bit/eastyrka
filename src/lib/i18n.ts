import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "@/locales/en.json";
import sv from "@/locales/sv.json";

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        sv: { translation: sv },
      },
      fallbackLng: "en",
      supportedLngs: ["en", "sv"],
      interpolation: { escapeValue: false },
      // Avoid Suspense so SSR/CSR fallback text matches.
      react: { useSuspense: false },
      // Prevent SSR/CSR hydration mismatch: server has no localStorage, so it
      // serves the fallback language (en). Force the same on initial client
      // render too; LanguageDetector still updates after hydration.
      lng: "en",
      detection: {
        order: ["localStorage", "navigator"],
        lookupLocalStorage: "ea.lang",
        caches: ["localStorage"],
      },
    });
}

export default i18n;
