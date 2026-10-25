import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Input, Spinner } from "@neochat/ui";
import type { BackupEntry, BackupSchedule } from "@neochat/shared";
import { useState } from "react";
import { apiFetch } from "../lib/api";

export function BackupPage() {
  const qc = useQueryClient();
  const [confirmId, setConfirmId] = useState("");
  const [restoreId, setRestoreId] = useState("");

  const backups = useQuery({
    queryKey: ["admin-backups"],
    queryFn: () => apiFetch<BackupEntry[]>("/admin/backup"),
  });

  const schedule = useQuery({
    queryKey: ["admin-backup-schedule"],
    queryFn: () => apiFetch<BackupSchedule>("/admin/backup/schedule"),
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<BackupEntry>("/admin/backup/create", {
        method: "POST",
        body: JSON.stringify({ includeDatabase: true }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-backups"] });
    },
  });

  const restore = useMutation({
    mutationFn: (backupId: string) =>
      apiFetch("/admin/backup/restore", {
        method: "POST",
        body: JSON.stringify({ backupId, confirm: true }),
      }),
    onSuccess: () => setRestoreId(""),
  });

  const saveSchedule = useMutation({
    mutationFn: (body: BackupSchedule) =>
      apiFetch("/admin/backup/schedule", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-backup-schedule"] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Backup &amp; Restore</h1>
      <p className="text-sm text-[var(--nc-muted)]">
        Backups include configuration and database exports (ciphertext messages only). Mirror MinIO
        separately.
      </p>

      <Card title="Create backup">
        <Button type="button" onClick={() => create.mutate()} disabled={create.isPending}>
          Create backup now
        </Button>
      </Card>

      <Card title="Scheduled backups">
        {schedule.isLoading ? (
          <Spinner />
        ) : schedule.data ? (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={schedule.data.enabled}
                onChange={(e) =>
                  saveSchedule.mutate({ ...schedule.data!, enabled: e.target.checked })
                }
              />
              Enable nightly backup (03:00 UTC)
            </label>
            <p className="text-xs text-[var(--nc-muted)]">Cron: {schedule.data.cronExpression}</p>
          </div>
        ) : null}
      </Card>

      <Card title="Backups">
        {backups.isLoading ? (
          <Spinner />
        ) : (
          <ul className="space-y-2 text-sm">
            {(backups.data ?? []).map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-2 border-b border-[var(--nc-border)] py-2"
              >
                <span>
                  {b.filename} ({Math.round(b.sizeBytes / 1024)} KiB)
                </span>
                <Button variant="ghost" type="button" onClick={() => setRestoreId(b.id)}>
                  Restore
                </Button>
              </li>
            ))}
            {!backups.data?.length ? (
              <p className="text-[var(--nc-muted)]">No backups yet.</p>
            ) : null}
          </ul>
        )}
      </Card>

      {restoreId ? (
        <Card title="Confirm restore">
          <p className="text-sm text-[var(--nc-muted)] mb-2">
            Type the backup id to confirm: {restoreId}
          </p>
          <Input
            label="Backup id"
            value={confirmId}
            onChange={(e) => setConfirmId(e.target.value)}
          />
          <Button
            variant="danger"
            type="button"
            disabled={confirmId !== restoreId || restore.isPending}
            onClick={() => restore.mutate(restoreId)}
          >
            Restore backup
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
