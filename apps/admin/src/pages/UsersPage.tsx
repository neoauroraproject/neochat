import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, Spinner } from "@neochat/ui";
import type { AdminUserRow, UpdateUserAdminRequest, UserRole } from "@neochat/shared";
import { useI18n } from "../i18n/I18nProvider";
import { apiFetch } from "../lib/api";

export function UsersPage() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => apiFetch<AdminUserRow[]>("/admin/users"),
    retry: false,
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserAdminRequest }) =>
      apiFetch(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const revokeSessions = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ revoked: number }>(`/admin/users/${id}/revoke-sessions`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("admin.users")}</h1>
      <Card>
        {users.isLoading ? (
          <Spinner />
        ) : users.isError ? (
          <p className="text-sm text-[var(--nc-muted)]">
            Users API not available ({users.error instanceof Error ? users.error.message : "error"})
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-[var(--nc-muted)] border-b border-[var(--nc-border)]">
                  <th className="py-2 pe-4">User</th>
                  <th className="py-2 pe-4">Role</th>
                  <th className="py-2 pe-4">Status</th>
                  <th className="py-2 pe-4">Last seen</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(users.data ?? []).map((u) => (
                  <tr key={u.id} className="border-b border-[var(--nc-border)]">
                    <td className="py-2 pe-4">
                      <p className="font-medium">{u.displayName}</p>
                      <p className="text-xs text-[var(--nc-muted)]">@{u.username}</p>
                    </td>
                    <td className="py-2 pe-4">
                      <select
                        className="nc-input text-xs py-1"
                        value={u.role}
                        onChange={(e) =>
                          update.mutate({ id: u.id, body: { role: e.target.value as UserRole } })
                        }
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="py-2 pe-4">
                      <Badge tone={u.status === "active" ? "success" : "danger"}>{u.status}</Badge>
                    </td>
                    <td className="py-2 pe-4 text-xs text-[var(--nc-muted)] whitespace-nowrap">
                      {u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleString() : "—"}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {u.status === "active" ? (
                          <Button
                            variant="ghost"
                            type="button"
                            onClick={() =>
                              update.mutate({ id: u.id, body: { status: "suspended" } })
                            }
                          >
                            Suspend
                          </Button>
                        ) : u.status !== "deleted" ? (
                          <Button
                            variant="ghost"
                            type="button"
                            onClick={() => update.mutate({ id: u.id, body: { status: "active" } })}
                          >
                            Activate
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() => revokeSessions.mutate(u.id)}
                          disabled={revokeSessions.isPending}
                        >
                          Force logout
                        </Button>
                      </div>
                    </td>
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
