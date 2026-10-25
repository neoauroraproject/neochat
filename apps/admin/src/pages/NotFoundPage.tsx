import { Link } from "react-router-dom";
import { Button, EmptyState } from "@neochat/ui";
import { useI18n } from "../i18n/I18nProvider";

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-[50vh] grid place-items-center">
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
