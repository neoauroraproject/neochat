import { Card, EmptyState, Heading, Text } from "@neochat/ui";
import { useI18n } from "../i18n/I18nProvider";
import { useAuthStore } from "../stores/stores";

export function HomePage() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);

  return (
    <div className="space-y-6 max-w-3xl">
      <Heading level={1}>{t("home.title")}</Heading>
      <Card>
        <EmptyState icon="✓" title={t("home.ready")} description={t("home.subtitle")} />
      </Card>
      {user ? (
        <Card title={t("settings.profile")}>
          <div className="space-y-1">
            <Text>{user.displayName}</Text>
            <Text muted>@{user.username}</Text>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
