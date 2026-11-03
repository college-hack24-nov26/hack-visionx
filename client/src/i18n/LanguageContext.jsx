import { createContext, useContext, useEffect, useState } from "react";
import { translations } from "./translations";

const LanguageContext = createContext(null);
const LANGS = ["en", "mr", "hi"];

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem("fws_lang");
    return LANGS.includes(saved) ? saved : "en";
  });

  useEffect(() => {
    localStorage.setItem("fws_lang", lang);
  }, [lang]);

  const setLang = (next) => {
    if (LANGS.includes(next)) setLangState(next);
  };

  // Ask for a word by its key; falls back to English, then to the key itself.
  const t = (key) => translations[lang]?.[key] ?? translations.en[key] ?? key;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside LanguageProvider");
  return ctx;
}
