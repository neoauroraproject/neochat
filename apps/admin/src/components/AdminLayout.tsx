import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Button } from "@neochat/ui";
import { LanguageSwitcher, useI18n } from "../i18n/I18nProvider";
import { useAuthStore, useUiStore } from "../stores/stores";

const NAV: Array<{ to: string; key: keyof import("@neochat/i18n").Messages; end?: boolean }> = [
  { to: "/", key: "admin.dashboard", end: true },
  { to: "/users", key: "admin.users" },
  { to: "/instance", key: "admin.instance" },
  { to: "/invites", key: "admin.invites" },
  { to: "/flags", key: "admin.featureFlags" },
  { to: "/config", key: "admin.config" },
  { to: "/audit", key: "admin.audit" },
  { to: "/plugins", key: "admin.plugins" },
  { to: "/retention", key: "admin.retention" },
  { to: "/tls", key: "admin.tls" },
  { to: "/backup", key: "admin.backup" },
  { to: "/performance", key: "admin.performance" },
  { to: "/maintenance", key: "admin.maintenance" },
  { to: "/settings", key: "admin.settings" },
];

export function AdminLayout() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh flex bg-[var(--nc-bg)] text-[var(--nc-text)]">
      <aside className="w-56 shrink-0 border-e border-[var(--nc-border)] bg-[var(--nc-surface)] flex flex-col">
        <div className="p-4 border-b border-[var(--nc-border)]">
          <p className="font-bold text-[var(--nc-brand)]">{t("app.name")}</p>
          <p className="text-xs text-[var(--nc-muted)]">Admin</p>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-md text-sm transition-colors ${isActive ? "bg-[var(--nc-brand-muted)] text-[var(--nc-brand)] font-medium" : "text-[var(--nc-muted)] hover:bg-[var(--nc-bg)]"}`
              }
            >
              {t(item.key)}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-[var(--nc-border)] space-y-2">
          <LanguageSwitcher className="nc-input w-full text-xs" />
          <Button variant="ghost" type="button" block onClick={toggleTheme}>
            {t("common.theme")}
          </Button>
          <p className="text-xs text-[var(--nc-muted)] truncate">{user?.displayName}</p>
          <Button
            variant="danger"
            type="button"
            block
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            {t("auth.logout")}
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-6 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
