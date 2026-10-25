import { Link } from "react-router-dom";
import { Button, EmptyState } from "@neochat/ui";
import { useI18n } from "../i18n/I18nProvider";

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-dvh grid place-items-center bg-[var(--nc-bg)]">
      <EmptyState
        icon="404"
        title={t("notFound.title")}
        description={t("notFound.message")}
        action={
          <Link to="/">
            <Button type="button">{t("notFound.back")}</Button>
          </Link>
        }
      />
    </div>
  );
}
