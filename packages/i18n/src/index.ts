import { en } from "./locales/en.js";
import { fa } from "./locales/fa.js";
import { ar } from "./locales/ar.js";
import { tr } from "./locales/tr.js";
import { ru } from "./locales/ru.js";
import {
  LOCALE_META,
  RTL_LOCALES,
  SUPPORTED_LOCALES,
  type Locale,
  type MessageKey,
  type Messages,
} from "./types.js";

export * from "./types.js";

export const messages: Record<Locale, Messages> = { en, fa, ar, tr, ru };

export function isRTL(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

export function dir(locale: Locale): "ltr" | "rtl" {
  return LOCALE_META[locale].dir;
}

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as ReadonlyArray<string>).includes(value);
}

/** Best-effort resolution from Accept-Language / navigator.language. */
export function resolveLocale(
  candidate: string | null | undefined,
  fallback: Locale = "en",
): Locale {
  if (!candidate) return fallback;
  const primary =
    candidate
      .toLowerCase()
      .split(/[-_,;]/)[0]
      ?.trim() ?? "";
  return isSupportedLocale(primary) ? primary : fallback;
}

/**
 * Create a translator with light `{placeholder}` interpolation.
 * Falls back to English, then to the key itself.
 */
export function createTranslator(locale: Locale) {
  const primary = messages[locale] ?? en;
  return function t(key: MessageKey, vars?: Record<string, string | number>): string {
    const template = primary[key] ?? en[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, name: string) =>
      name in vars ? String(vars[name]) : `{${name}}`,
    );
  };
}

export type Translator = ReturnType<typeof createTranslator>;
