import type { ReactNode } from "react";
import { LanguageSwitcher, useI18n } from "../i18n/I18nProvider";

export function AuthLayout({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="tg-auth">
      <div className="tg-auth-card">
        <div className="tg-auth-logo" aria-hidden>
          N
        </div>
        <h1>{t("app.name")}</h1>
        <p className="sub">{subtitle ?? title}</p>
        {children}
        <div className="flex justify-center mt-4">
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
