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
      // Avoid Suspense so SSR/CSR fallback text stays deterministic and we
      // don't trigger React #418 hydration mismatches on transient loaders.
      react: { useSuspense: false },
      detection: {
        order: ["localStorage", "navigator"],
        lookupLocalStorage: "ea.lang",
        caches: ["localStorage"],
      },
    });
}

export default i18n;
