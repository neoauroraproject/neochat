import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, Input, Spinner } from "@neochat/ui";
import type { CreateInviteRequest, Invite } from "@neochat/shared";
import { useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { apiFetch } from "../lib/api";

function inviteStatus(inv: Invite): { label: string; tone: "success" | "danger" | "warning" } {
  if (inv.revokedAt) return { label: "revoked", tone: "danger" };
  if (inv.expiresAt && new Date(inv.expiresAt).getTime() < Date.now())
    return { label: "expired", tone: "warning" };
  if (inv.uses >= inv.maxUses) return { label: "exhausted", tone: "warning" };
  return { label: "active", tone: "success" };
}

export function InvitesPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInHours, setExpiresInHours] = useState(72);

  const invites = useQuery({
    queryKey: ["admin-invites"],
    queryFn: () => apiFetch<Invite[]>("/admin/invites"),
    retry: false,
  });

  const create = useMutation({
    mutationFn: (body: CreateInviteRequest) =>
      apiFetch<Invite>("/admin/invites", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-invites"] }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => apiFetch(`/admin/invites/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-invites"] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("admin.invites")}</h1>

      <Card title="Create invite">
        <div className="flex flex-wrap gap-3 items-end">
          <Input
            label="Max uses"
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(Number(e.target.value))}
          />
          <Input
            label="Expires (hours)"
            type="number"
            min={1}
            value={expiresInHours}
            onChange={(e) => setExpiresInHours(Number(e.target.value))}
          />
          <Button
            type="button"
            onClick={() => create.mutate({ maxUses, expiresInHours })}
            disabled={create.isPending}
          >
            Create
          </Button>
        </div>
        {create.data ? (
          <p className="mt-3 text-sm">
            Code:{" "}
            <code className="bg-[var(--nc-surface)] px-2 py-1 rounded">{create.data.code}</code>
          </p>
        ) : null}
      </Card>

      <Card title="Invites">
        {invites.isLoading ? (
          <Spinner />
        ) : invites.isError ? (
          <p className="text-sm text-[var(--nc-muted)]">Invites API not available</p>
        ) : (
          <ul className="text-sm space-y-2">
            {(invites.data ?? []).map((inv) => {
              const status = inviteStatus(inv);
              return (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-2 rounded bg-[var(--nc-surface)]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <code>{inv.code}</code>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[var(--nc-muted)]">
                      {inv.uses}/{inv.maxUses} uses
                    </span>
                    {inv.expiresAt ? (
                      <span className="text-xs text-[var(--nc-muted)]">
                        exp {new Date(inv.expiresAt).toLocaleDateString()}
                      </span>
                    ) : null}
                    {!inv.revokedAt && status.label === "active" ? (
                      <Button
                        variant="ghost"
                        type="button"
                        onClick={() => revoke.mutate(inv.id)}
                        disabled={revoke.isPending}
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
