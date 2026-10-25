import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Spinner } from "@neochat/ui";
import { PERMISSION_TEMPLATES } from "@neochat/shared";
import { apiFetch } from "../lib/api";

export function MaintenancePage() {
  const qc = useQueryClient();
  const maintenance = useQuery({
    queryKey: ["admin-maintenance"],
    queryFn: () =>
      apiFetch<{ maintenanceMode: boolean; maintenanceMessage: string }>("/admin/maintenance"),
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      apiFetch("/admin/maintenance", { method: "POST", body: JSON.stringify({ enabled }) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-maintenance"] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">System Maintenance</h1>

      <Card title="Maintenance mode">
        {maintenance.isLoading ? (
          <Spinner />
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              Status: <strong>{maintenance.data?.maintenanceMode ? "ENABLED" : "disabled"}</strong>
            </p>
            <p className="text-xs text-[var(--nc-muted)]">{maintenance.data?.maintenanceMessage}</p>
            <Button
              variant={maintenance.data?.maintenanceMode ? "ghost" : "danger"}
              type="button"
              onClick={() => toggle.mutate(!maintenance.data?.maintenanceMode)}
              disabled={toggle.isPending}
            >
              {maintenance.data?.maintenanceMode ? "Disable maintenance" : "Enable maintenance"}
            </Button>
          </div>
        )}
      </Card>

      <Card title="Permission templates">
        <ul className="space-y-3 text-sm">
          {Object.entries(PERMISSION_TEMPLATES).map(([key, tpl]) => (
            <li key={key}>
              <p className="font-medium">{tpl.label}</p>
              <p className="text-[var(--nc-muted)]">{tpl.description}</p>
              <p className="text-xs mt-1">{tpl.permissions.join(", ")}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
