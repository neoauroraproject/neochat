import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Input, Spinner } from "@neochat/ui";
import type { FeatureFlag, UpdateFeatureFlagRequest } from "@neochat/shared";
import { useI18n } from "../i18n/I18nProvider";
import { apiFetch } from "../lib/api";

const GROUP_ORDER = [
  "messaging",
  "calls",
  "plugins",
  "auth",
  "admin",
  "experimental",
  "ai",
] as const;

function flagGroup(key: string): string {
  const dot = key.indexOf(".");
  return dot > 0 ? key.slice(0, dot) : "other";
}

function groupFlags(flags: FeatureFlag[]): Map<string, FeatureFlag[]> {
  const map = new Map<string, FeatureFlag[]>();
  for (const flag of flags) {
    const group = flagGroup(flag.key);
    const list = map.get(group) ?? [];
    list.push(flag);
    map.set(group, list);
  }
  return map;
}

export function FeatureFlagsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const flags = useQuery({
    queryKey: ["admin-flags"],
    queryFn: () => apiFetch<FeatureFlag[]>("/admin/feature-flags"),
    retry: false,
  });

  const update = useMutation({
    mutationFn: ({ key, body }: { key: string; body: UpdateFeatureFlagRequest }) =>
      apiFetch(`/admin/feature-flags/${encodeURIComponent(key)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-flags"] }),
  });

  const grouped = groupFlags(flags.data ?? []);
  const groups = [
    ...GROUP_ORDER.filter((g) => grouped.has(g)),
    ...[...grouped.keys()]
      .filter((g) => !GROUP_ORDER.includes(g as (typeof GROUP_ORDER)[number]))
      .sort(),
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("admin.featureFlags")}</h1>
      {flags.isLoading ? (
        <Spinner />
      ) : flags.isError ? (
        <Card>
          <p className="text-sm text-[var(--nc-muted)]">Feature flags API not available</p>
        </Card>
      ) : (
        groups.map((group) => (
          <Card key={group} title={group}>
            <ul className="space-y-3">
              {(grouped.get(group) ?? []).map((flag) => (
                <li
                  key={flag.key}
                  className="flex flex-wrap items-center justify-between gap-4 p-3 rounded bg-[var(--nc-surface)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{flag.key}</p>
                    {flag.description ? (
                      <p className="text-xs text-[var(--nc-muted)]">{flag.description}</p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-2 max-w-xs">
                      <Input
                        label="Rollout %"
                        type="number"
                        min={0}
                        max={100}
                        value={flag.rolloutPercentage}
                        onChange={(e) =>
                          update.mutate({
                            key: flag.key,
                            body: { rolloutPercentage: Number(e.target.value) },
                          })
                        }
                      />
                    </div>
                  </div>
                  <Button
                    variant={flag.enabled ? "primary" : "ghost"}
                    type="button"
                    onClick={() =>
                      update.mutate({ key: flag.key, body: { enabled: !flag.enabled } })
                    }
                  >
                    {flag.enabled ? "On" : "Off"}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
