import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Heading, Input, Spinner, Tabs, Text, Textarea } from "@neochat/ui";
import type { Device } from "@neochat/shared";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LanguageSwitcher, useI18n } from "../i18n/I18nProvider";
import { apiFetch } from "../lib/api";
import { useAuthStore, useUiStore } from "../stores/stores";
import { CallHistoryPanel, CallSettingsPanel } from "../components/calls/CallSettings";
import { useCallMeta } from "../hooks/useCalls";
import { usePrefsStore } from "../stores/messaging";

export function SettingsPage() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const loadProfile = useAuthStore((s) => s.loadProfile);
  const logout = useAuthStore((s) => s.logout);
  const themePreference = useUiStore((s) => s.themePreference);
  const setThemePreference = useUiStore((s) => s.setThemePreference);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const soundEnabled = usePrefsStore((s) => s.soundEnabled);
  const browserNotifications = usePrefsStore((s) => s.browserNotifications);
  const autoDownloadMedia = usePrefsStore((s) => s.autoDownloadMedia);
  const setSoundEnabled = usePrefsStore((s) => s.setSoundEnabled);
  const setBrowserNotifications = usePrefsStore((s) => s.setBrowserNotifications);
  const setAutoDownloadMedia = usePrefsStore((s) => s.setAutoDownloadMedia);
  useCallMeta();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");

  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: () => apiFetch<Device[]>("/users/me/devices"),
  });

  const updateProfile = useMutation({
    mutationFn: () =>
      apiFetch("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName, bio: bio || null }),
      }),
    onSuccess: () => void loadProfile(),
  });

  const revokeDevice = useMutation({
    mutationFn: (deviceId: string) =>
      apiFetch(`/users/me/devices/${deviceId}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["devices"] }),
  });

  return (
    <div className="min-h-dvh bg-[var(--nc-bg)] text-[var(--nc-text)] p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-[var(--nc-brand)] hover:underline text-sm">
            {t("common.back")}
          </Link>
          <Heading level={1}>{t("settings.title")}</Heading>
        </div>

        <Tabs
          items={[
            {
              id: "profile",
              label: t("settings.profile"),
              content: (
                <Card>
                  <div className="space-y-3">
                    <Input
                      label={t("auth.displayName")}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                    <Textarea
                      label="Bio"
                      value={bio ?? ""}
                      onChange={(e) => setBio(e.target.value)}
                      rows={3}
                    />
                    <Text muted>@{user?.username}</Text>
                    <Button
                      type="button"
                      onClick={() => updateProfile.mutate()}
                      disabled={updateProfile.isPending}
                    >
                      {t("common.save")}
                    </Button>
                  </div>
                </Card>
              ),
            },
            {
              id: "privacy",
              label: t("settings.privacy"),
              content: (
                <Card>
                  <Text muted>{t("settings.privacyStub")}</Text>
                </Card>
              ),
            },
            {
              id: "devices",
              label: t("settings.devices"),
              content: (
                <Card>
                  {devices.isLoading ? (
                    <Spinner />
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {(devices.data ?? []).map((d) => (
                        <li
                          key={d.id}
                          className="flex justify-between items-center p-2 rounded bg-[var(--nc-bg)]"
                        >
                          <div>
                            <span>{d.name}</span>
                            {d.current ? (
                              <span className="ms-2 text-[var(--nc-brand)] text-xs">
                                {t("settings.currentDevice")}
                              </span>
                            ) : null}
                          </div>
                          {!d.current ? (
                            <Button
                              variant="danger"
                              type="button"
                              className="nc-btn--sm"
                              onClick={() => revokeDevice.mutate(d.id)}
                              disabled={revokeDevice.isPending}
                            >
                              {t("settings.revoke")}
                            </Button>
                          ) : null}
                        </li>
                      ))}
                      {!devices.data?.length ? <Text muted>{t("settings.noDevices")}</Text> : null}
                    </ul>
                  )}
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
                  <div className="flex flex-wrap gap-2">
                    {(["light", "dark", "system"] as const).map((pref) => (
                      <Button
                        key={pref}
                        variant={themePreference === pref ? "primary" : "ghost"}
                        type="button"
                        onClick={() => setThemePreference(pref)}
                      >
                        {pref === "system"
                          ? "System"
                          : pref === "dark"
                            ? t("common.theme.dark")
                            : t("common.theme.light")}
                      </Button>
                    ))}
                  </div>
                </Card>
              ),
            },
            {
              id: "notifications",
              label: t("settings.notifications"),
              content: (
                <Card>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={soundEnabled}
                        onChange={(e) => setSoundEnabled(e.target.checked)}
                      />
                      {t("settings.sound")}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={browserNotifications}
                        onChange={(e) => setBrowserNotifications(e.target.checked)}
                      />
                      {t("settings.browserNotifications")}
                    </label>
                  </div>
                </Card>
              ),
            },
            {
              id: "calls",
              label: t("calls.settings"),
              content: (
                <Card>
                  <CallSettingsPanel />
                </Card>
              ),
            },
            {
              id: "callHistory",
              label: t("calls.history"),
              content: (
                <Card>
                  <CallHistoryPanel />
                </Card>
              ),
            },
            {
              id: "storage",
              label: t("settings.storage"),
              content: (
                <Card>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={autoDownloadMedia}
                      onChange={(e) => setAutoDownloadMedia(e.target.checked)}
                    />
                    {t("settings.autoDownload")}
                  </label>
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
    </div>
  );
}
