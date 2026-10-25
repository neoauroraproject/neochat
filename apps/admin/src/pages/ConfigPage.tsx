import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Spinner } from "@neochat/ui";
import type { ConfigEntry } from "@neochat/shared";
import { useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { apiFetch } from "../lib/api";

const SAFE_CATEGORIES = [
  "general",
  "security",
  "media",
  "calls",
  "notifications",
  "retention",
] as const;

export function ConfigPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [category, setCategory] = useState<string>("general");
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);

  const config = useQuery({
    queryKey: ["admin-config", category],
    queryFn: () =>
      apiFetch<ConfigEntry[]>(`/admin/config?category=${encodeURIComponent(category)}`),
    retry: false,
  });

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      apiFetch(`/admin/config/${encodeURIComponent(category)}/${encodeURIComponent(key)}`, {
        method: "PATCH",
        body: JSON.stringify({ value }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-config", category] });
      setEditing(null);
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("admin.config")}</h1>

      <div className="flex gap-2 flex-wrap">
        {SAFE_CATEGORIES.map((c) => (
          <Button
            key={c}
            variant={category === c ? "primary" : "ghost"}
            type="button"
            onClick={() => setCategory(c)}
          >
            {c}
          </Button>
        ))}
      </div>

      <Card title={`Category: ${category}`}>
        {config.isLoading ? (
          <Spinner />
        ) : config.isError ? (
          <p className="text-sm text-[var(--nc-muted)]">Config API not available yet</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {(config.data ?? []).map((entry) => (
              <li key={entry.key} className="p-3 rounded bg-[var(--nc-surface)]">
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{entry.key}</p>
                    {editing?.key === entry.key ? (
                      <textarea
                        className="nc-input w-full mt-2 font-mono text-xs"
                        rows={3}
                        value={editing.value}
                        onChange={(e) => setEditing({ key: entry.key, value: e.target.value })}
                      />
                    ) : (
                      <pre className="text-xs text-[var(--nc-muted)] mt-1 overflow-x-auto">
                        {JSON.stringify(entry.value, null, 2)}
                      </pre>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {editing?.key === entry.key ? (
                      <>
                        <Button
                          type="button"
                          onClick={() => {
                            try {
                              save.mutate({ key: entry.key, value: JSON.parse(editing.value) });
                            } catch {
                              save.mutate({ key: entry.key, value: editing.value });
                            }
                          }}
                        >
                          Save
                        </Button>
                        <Button variant="ghost" type="button" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="ghost"
                        type="button"
                        onClick={() =>
                          setEditing({ key: entry.key, value: JSON.stringify(entry.value) })
                        }
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
