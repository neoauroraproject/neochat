import { useQuery } from "@tanstack/react-query";
import { Card, Spinner } from "@neochat/ui";
import type { AuditLogEntry } from "@neochat/shared";
import { useI18n } from "../i18n/I18nProvider";
import { apiFetch } from "../lib/api";

export function AuditPage() {
  const { t } = useI18n();
  const audit = useQuery({
    queryKey: ["admin-audit"],
    queryFn: () => apiFetch<AuditLogEntry[]>("/admin/audit"),
    retry: false,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("admin.audit")}</h1>
      <Card>
        {audit.isLoading ? (
          <Spinner />
        ) : audit.isError ? (
          <p className="text-sm text-[var(--nc-muted)]">Audit API not available yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-[var(--nc-muted)] border-b border-[var(--nc-border)]">
                  <th className="py-2 pe-4">Time</th>
                  <th className="py-2 pe-4">Action</th>
                  <th className="py-2 pe-4">Target</th>
                  <th className="py-2">IP</th>
                </tr>
              </thead>
              <tbody>
                {(audit.data ?? []).map((row) => (
                  <tr key={row.id} className="border-b border-[var(--nc-border)]">
                    <td className="py-2 pe-4 whitespace-nowrap">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pe-4">{row.action}</td>
                    <td className="py-2 pe-4 text-[var(--nc-muted)]">
                      {row.targetType ?? "—"} {row.targetId ?? ""}
                    </td>
                    <td className="py-2">{row.ip ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
