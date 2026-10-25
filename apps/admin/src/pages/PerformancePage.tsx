import { useQuery } from "@tanstack/react-query";
import { Badge, Card, Spinner } from "@neochat/ui";
import type { HealthCheck } from "@neochat/shared";
import { useI18n } from "../i18n/I18nProvider";
import { apiFetch } from "../lib/api";

function tone(status?: string) {
  if (status === "ok") return "success" as const;
  if (status === "degraded") return "warning" as const;
  return "danger" as const;
}

export function PerformancePage() {
  const { t } = useI18n();
  const diagnostics = useQuery({
    queryKey: ["admin-diagnostics"],
    queryFn: () => apiFetch<HealthCheck>("/admin/diagnostics"),
    refetchInterval: 30_000,
  });

  const checks = diagnostics.data?.checks ?? {};

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Performance &amp; Diagnostics</h1>
      <p className="text-sm text-[var(--nc-muted)]">
        {t("admin.diagnostics")} — live system health aggregation.
      </p>

      {diagnostics.isLoading ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(checks).map(([key, check]) => (
            <Card key={key} title={key}>
              <Badge tone={tone(check?.status)}>{check?.status ?? "unknown"}</Badge>
              {check?.detail ? (
                <p className="text-xs text-[var(--nc-muted)] mt-2">{check.detail}</p>
              ) : null}
              {check?.latencyMs != null ? (
                <p className="text-xs text-[var(--nc-muted)]">{check.latencyMs} ms</p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
