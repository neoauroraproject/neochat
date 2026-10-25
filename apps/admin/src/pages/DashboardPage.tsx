import { useQuery } from "@tanstack/react-query";
import { Badge, Card, Spinner } from "@neochat/ui";
import type { HealthCheck } from "@neochat/shared";
import { useI18n } from "../i18n/I18nProvider";
import { apiFetch } from "../lib/api";

interface SystemInfo {
  version: string;
  uptimeSeconds: number;
  instanceName: string;
  environment: string;
}

const CHECK_LABELS: Record<string, string> = {
  api: "API",
  database: "Database",
  redis: "Redis",
  storage: "Storage",
  disk: "Disk",
  memory: "Memory",
  cpu: "CPU",
  jobs: "Jobs",
  certificates: "TLS certs",
  plugins: "Plugins",
};

function tone(status?: string): "success" | "danger" | "warning" {
  if (status === "ok") return "success";
  if (status === "degraded") return "warning";
  return "danger";
}

function DiagnosticCard({ name, check }: { name: string; check: HealthCheck["checks"][string] }) {
  if (!check) return null;
  return (
    <Card title={CHECK_LABELS[name] ?? name}>
      <div className="space-y-1 text-sm">
        <Badge tone={tone(check.status)}>{check.status}</Badge>
        {check.latencyMs !== undefined ? (
          <p className="text-[var(--nc-muted)]">{check.latencyMs}ms</p>
        ) : null}
        {check.detail ? (
          <p className="text-xs text-[var(--nc-muted)] break-words">{check.detail}</p>
        ) : null}
      </div>
    </Card>
  );
}

export function DashboardPage() {
  const { t } = useI18n();

  const live = useQuery({
    queryKey: ["health-live"],
    queryFn: () =>
      apiFetch<{ status: string; version: string; uptimeSeconds: number }>("/health/live"),
  });

  const ready = useQuery({
    queryKey: ["health-ready"],
    queryFn: () => apiFetch<HealthCheck>("/health/ready"),
    retry: false,
  });

  const diagnostics = useQuery({
    queryKey: ["admin-diagnostics"],
    queryFn: () => apiFetch<HealthCheck>("/admin/diagnostics"),
  });

  const system = useQuery({
    queryKey: ["system-info"],
    queryFn: () => apiFetch<SystemInfo>("/system"),
  });

  const checks = diagnostics.data?.checks ?? {};
  const checkOrder = [
    "database",
    "redis",
    "storage",
    "api",
    "disk",
    "memory",
    "cpu",
    "plugins",
    "certificates",
    "jobs",
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("admin.dashboard")}</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Live">
          {live.isLoading ? (
            <Spinner />
          ) : (
            <div className="space-y-1 text-sm">
              <Badge tone="success">{live.data?.status ?? "—"}</Badge>
              <p>Version {live.data?.version}</p>
              <p className="text-[var(--nc-muted)]">
                Uptime {Math.floor(live.data?.uptimeSeconds ?? 0)}s
              </p>
            </div>
          )}
        </Card>

        <Card title="Ready">
          {ready.isLoading ? (
            <Spinner />
          ) : ready.isError ? (
            <p className="text-sm text-[var(--nc-danger)]">Unable to load readiness</p>
          ) : (
            <div className="space-y-1 text-sm">
              <Badge tone={tone(ready.data?.status)}>{ready.data?.status}</Badge>
              <ul className="text-xs text-[var(--nc-muted)] space-y-0.5">
                {Object.entries(ready.data?.checks ?? {}).map(([name, check]) => (
                  <li key={name}>
                    {name}: {check.status}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title="System">
          {system.isLoading ? (
            <Spinner />
          ) : (
            <div className="space-y-1 text-sm">
              <p className="font-medium">{system.data?.instanceName}</p>
              <p className="text-[var(--nc-muted)]">{system.data?.environment}</p>
              <p className="text-xs text-[var(--nc-muted)]">v{system.data?.version}</p>
            </div>
          )}
        </Card>

        <Card title={t("admin.diagnostics")}>
          {diagnostics.isLoading ? (
            <Spinner />
          ) : diagnostics.isError ? (
            <p className="text-sm text-[var(--nc-danger)]">Unable to load diagnostics</p>
          ) : (
            <div className="space-y-1 text-sm">
              <Badge tone={tone(diagnostics.data?.status)}>{diagnostics.data?.status}</Badge>
              <p className="text-[var(--nc-muted)]">{Object.keys(checks).length} checks</p>
            </div>
          )}
        </Card>
      </div>

      {diagnostics.isLoading ? (
        <Spinner />
      ) : diagnostics.data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {checkOrder.map((name) =>
            checks[name] ? <DiagnosticCard key={name} name={name} check={checks[name]!} /> : null,
          )}
        </div>
      ) : null}
    </div>
  );
}
