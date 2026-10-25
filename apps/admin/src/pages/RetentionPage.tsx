import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, Input, Spinner } from "@neochat/ui";
import type { HealthCheck, RetentionPolicy, UpsertRetentionPolicyRequest } from "@neochat/shared";
import { useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { apiFetch } from "../lib/api";

export function RetentionPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [form, setForm] = useState<UpsertRetentionPolicyRequest>({
    scope: "messages",
    chatType: "all",
    maxAgeDays: 365,
    enabled: true,
  });

  const policies = useQuery({
    queryKey: ["admin-retention"],
    queryFn: () => apiFetch<RetentionPolicy[]>("/admin/retention"),
    retry: false,
  });

  const diagnostics = useQuery({
    queryKey: ["admin-diagnostics"],
    queryFn: () => apiFetch<HealthCheck>("/admin/diagnostics"),
    retry: false,
  });

  const storageCheck = diagnostics.data?.checks?.storage;

  const save = useMutation({
    mutationFn: (body: UpsertRetentionPolicyRequest) =>
      apiFetch("/admin/retention", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-retention"] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("admin.retention")}</h1>

      <Card title="Storage status">
        {diagnostics.isLoading ? (
          <Spinner />
        ) : diagnostics.isError ? (
          <p className="text-sm text-[var(--nc-muted)]">Storage diagnostics unavailable</p>
        ) : (
          <div className="flex items-center gap-3 text-sm">
            <Badge
              tone={
                storageCheck?.status === "ok"
                  ? "success"
                  : storageCheck?.status === "degraded"
                    ? "warning"
                    : "danger"
              }
            >
              {storageCheck?.status ?? "unknown"}
            </Badge>
            <span className="text-[var(--nc-muted)]">
              {storageCheck?.detail ?? "MinIO / object storage"}
            </span>
          </div>
        )}
      </Card>

      <Card title="Upsert policy">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="nc-field">
            <span className="nc-field__label">Scope</span>
            <select
              className="nc-input"
              value={form.scope}
              onChange={(e) =>
                setForm({ ...form, scope: e.target.value as UpsertRetentionPolicyRequest["scope"] })
              }
            >
              <option value="messages">messages</option>
              <option value="media">media</option>
              <option value="audit">audit</option>
            </select>
          </label>
          <label className="nc-field">
            <span className="nc-field__label">Chat type</span>
            <select
              className="nc-input"
              value={form.chatType}
              onChange={(e) =>
                setForm({
                  ...form,
                  chatType: e.target.value as UpsertRetentionPolicyRequest["chatType"],
                })
              }
            >
              <option value="all">all</option>
              <option value="dm">dm</option>
              <option value="group">group</option>
              <option value="channel">channel</option>
            </select>
          </label>
          <Input
            label="Max age (days)"
            type="number"
            value={form.maxAgeDays ?? ""}
            onChange={(e) => setForm({ ...form, maxAgeDays: Number(e.target.value) })}
          />
          <label className="flex items-center gap-2 mt-6">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            Enabled
          </label>
        </div>
        <Button
          className="mt-4"
          type="button"
          onClick={() => save.mutate(form)}
          disabled={save.isPending}
        >
          Save policy
        </Button>
      </Card>

      <Card title="Current policies">
        {policies.isLoading ? (
          <Spinner />
        ) : policies.isError ? (
          <p className="text-sm text-[var(--nc-muted)]">Retention API not available yet</p>
        ) : (
          <ul className="text-sm space-y-2">
            {(policies.data ?? []).map((p) => (
              <li key={p.id} className="p-2 rounded bg-[var(--nc-surface)] flex justify-between">
                <span>
                  {p.scope} / {p.chatType}
                </span>
                <span className="text-[var(--nc-muted)]">
                  {p.enabled ? `${p.maxAgeDays}d` : "disabled"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
