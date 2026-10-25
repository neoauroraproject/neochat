import { Button, Card, Heading, Tabs, Text } from "@neochat/ui";
import { useNavigate } from "react-router-dom";
import { LanguageSwitcher, useI18n } from "../i18n/I18nProvider";
import { useAuthStore, useUiStore } from "../stores/stores";

export function SettingsPage() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-2xl">
      <Heading level={1}>{t("admin.settings")}</Heading>

      <Tabs
        items={[
          {
            id: "profile",
            label: t("settings.profile"),
            content: (
              <Card>
                <Text>{user?.displayName}</Text>
                <Text muted>
                  @{user?.username} · {user?.role}
                </Text>
              </Card>
            ),
          },
          {
            id: "locale",
            label: t("common.language"),
            content: (
              <Card>
                <LanguageSwitcher className="nc-input w-full max-w-xs" />
              </Card>
            ),
          },
          {
            id: "theme",
            label: t("common.theme"),
            content: (
              <Card>
                <Button variant="ghost" type="button" onClick={toggleTheme}>
                  {theme === "dark" ? t("common.theme.light") : t("common.theme.dark")}
                </Button>
              </Card>
            ),
          },
        ]}
      />

      <Card>
        <Button
          variant="danger"
          type="button"
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
        >
          {t("auth.logout")}
        </Button>
      </Card>
    </div>
  );
}
