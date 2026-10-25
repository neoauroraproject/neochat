import type { Locale } from "@neochat/i18n";
import { createTranslator, dir, isRTL } from "@neochat/i18n";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

const LOCALE_KEY = "neochat.admin.locale";

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: ReturnType<typeof createTranslator>;
  isRtl: boolean;
  direction: "ltr" | "rtl";
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readStoredLocale(): Locale {
  const stored = localStorage.getItem(LOCALE_KEY);
  if (stored === "en" || stored === "fa" || stored === "ar" || stored === "tr" || stored === "ru")
    return stored;
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = readStoredLocale();

  const value = useMemo<I18nContextValue>(() => {
    const current = readStoredLocale();
    return {
      locale: current,
      setLocale: (next: Locale) => {
        localStorage.setItem(LOCALE_KEY, next);
        document.documentElement.lang = next;
        document.documentElement.dir = dir(next);
        window.location.reload();
      },
      t: createTranslator(current),
      isRtl: isRTL(current),
      direction: dir(current),
    };
  }, [locale]);

  useEffect(() => {
    document.documentElement.lang = value.locale;
    document.documentElement.dir = value.direction;
  }, [value.locale, value.direction]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  return (
    <select
      className={className ?? "nc-input text-sm py-1 px-2"}
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      aria-label="Language"
    >
      <option value="en">English</option>
      <option value="fa">فارسی</option>
      <option value="ar">العربية</option>
      <option value="tr">Türkçe</option>
      <option value="ru">Русский</option>
    </select>
  );
}
