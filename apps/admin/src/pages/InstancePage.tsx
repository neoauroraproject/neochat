import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Input, Spinner } from "@neochat/ui";
import type { ConfigEntry } from "@neochat/shared";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { apiFetch } from "../lib/api";

interface SystemInfo {
  version: string;
  uptimeSeconds: number;
  instanceName: string;
  environment: string;
}

export function InstancePage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [instanceName, setInstanceName] = useState("");
  const [defaultLocale, setDefaultLocale] = useState("en");
  const [allowOpenRegistration, setAllowOpenRegistration] = useState(false);

  const system = useQuery({
    queryKey: ["system-info"],
    queryFn: () => apiFetch<SystemInfo>("/system"),
  });

  const config = useQuery({
    queryKey: ["admin-config", "general"],
    queryFn: () => apiFetch<ConfigEntry[]>("/admin/config?category=general"),
    retry: false,
  });

  useEffect(() => {
    if (config.data) {
      const byKey = Object.fromEntries(config.data.map((e) => [e.key, e.value]));
      if (typeof byKey.instanceName === "string") setInstanceName(byKey.instanceName);
      if (typeof byKey.defaultLocale === "string") setDefaultLocale(byKey.defaultLocale);
      if (typeof byKey.allowOpenRegistration === "boolean")
        setAllowOpenRegistration(byKey.allowOpenRegistration);
    }
  }, [config.data]);

  const save = useMutation({
    mutationFn: async () => {
      await apiFetch("/admin/config/general/instanceName", {
        method: "PATCH",
        body: JSON.stringify({ value: instanceName }),
      });
      await apiFetch("/admin/config/general/defaultLocale", {
        method: "PATCH",
        body: JSON.stringify({ value: defaultLocale }),
      });
      await apiFetch("/admin/config/general/allowOpenRegistration", {
        method: "PATCH",
        body: JSON.stringify({ value: allowOpenRegistration }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-config", "general"] });
      void qc.invalidateQueries({ queryKey: ["system-info"] });
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("admin.instance")}</h1>
      <p className="text-sm text-[var(--nc-muted)]">{t("admin.instanceHint")}</p>

      <Card title={t("admin.instanceInfo")}>
        {system.isLoading ? (
          <Spinner />
        ) : (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--nc-muted)]">Version</dt>
              <dd className="font-medium">{system.data?.version ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--nc-muted)]">Environment</dt>
              <dd className="font-medium">{system.data?.environment ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--nc-muted)]">Uptime</dt>
              <dd className="font-medium">{Math.floor(system.data?.uptimeSeconds ?? 0)}s</dd>
            </div>
            <div>
              <dt className="text-[var(--nc-muted)]">Instance name</dt>
              <dd className="font-medium">{system.data?.instanceName ?? "—"}</dd>
            </div>
          </dl>
        )}
      </Card>

      <Card title={t("admin.instanceSettings")}>
        {config.isLoading ? (
          <Spinner />
        ) : config.isError ? (
          <p className="text-sm text-[var(--nc-muted)]">Config API not available</p>
        ) : (
          <div className="space-y-4">
            <Input
              label={t("setup.organization.instanceName")}
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
            />
            <label className="nc-field">
              <span className="nc-field__label">{t("setup.organization.defaultLocale")}</span>
              <select
                className="nc-input"
                value={defaultLocale}
                onChange={(e) => setDefaultLocale(e.target.value)}
              >
                <option value="en">English</option>
                <option value="fa">فارسی</option>
                <option value="ar">العربية</option>
                <option value="tr">Türkçe</option>
                <option value="ru">Русский</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allowOpenRegistration}
                onChange={(e) => setAllowOpenRegistration(e.target.checked)}
              />
              {t("setup.organization.allowRegistration")}
            </label>
            <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
              {t("common.save")}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
