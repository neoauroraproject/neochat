import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, EmptyState, Heading, Spinner, Text } from "@neochat/ui";
import type { PluginHostStatus } from "@neochat/shared";
import { useI18n } from "../i18n/I18nProvider";
import { apiFetch } from "../lib/api";

export function PluginsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const host = useQuery({
    queryKey: ["admin-plugins"],
    queryFn: () => apiFetch<PluginHostStatus>("/admin/plugins"),
    retry: false,
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiFetch(`/admin/plugins/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-plugins"] }),
  });

  return (
    <div className="space-y-6">
      <Heading level={1}>{t("admin.plugins")}</Heading>

      <Card title={t("admin.pluginHost")}>
        {host.isLoading ? (
          <Spinner />
        ) : host.isError ? (
          <Text muted>Unable to load plugin host status</Text>
        ) : (
          <div className="space-y-2">
            <Badge tone={host.data?.ready ? "success" : "danger"}>
              {host.data?.ready ? "ready" : "down"}
            </Badge>
            <Text muted>Host version {host.data?.hostVersion}</Text>
            <Text muted>{host.data?.pluginCount ?? 0} plugin(s) discovered</Text>
          </div>
        )}
      </Card>

      <Card title={t("admin.plugins")}>
        {host.data?.plugins.length ? (
          <ul className="space-y-3">
            {host.data.plugins.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 text-sm border-b border-[var(--nc-border)] pb-2"
              >
                <div>
                  <p className="font-medium">{p.manifest.name}</p>
                  <p className="text-xs text-[var(--nc-muted)]">
                    {p.manifest.id} v{p.manifest.version}
                  </p>
                  <p className="text-xs text-[var(--nc-muted)]">
                    {p.manifest.capabilities.join(", ") || "no capabilities"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => toggle.mutate({ id: p.id, enabled: !p.enabled })}
                  disabled={toggle.isPending}
                >
                  {p.enabled ? "Disable" : "Enable"}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="🔌"
            title={t("admin.noPlugins")}
            description="Install plugins in the server plugins directory."
          />
        )}
      </Card>
    </div>
  );
}
