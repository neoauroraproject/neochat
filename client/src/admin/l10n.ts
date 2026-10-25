import { useApp } from "../store";

/** The admin panel keeps its strings inline: L('فارسی', 'English'). */
export function useL() {
  const lang = useApp((s) => s.lang);
  return (fa: string, en: string) => (lang === "en" ? en : fa);
}
