import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { ToastProvider } from "@neochat/ui";
import { AdminLayout } from "./components/AdminLayout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { GuestRoute, ProtectedRoute } from "./components/RouteGuards";
import { I18nProvider } from "./i18n/I18nProvider";
import { AuditPage } from "./pages/AuditPage";
import { BackupPage } from "./pages/BackupPage";
import { ConfigPage } from "./pages/ConfigPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FeatureFlagsPage } from "./pages/FeatureFlagsPage";
import { InstancePage } from "./pages/InstancePage";
import { InvitesPage } from "./pages/InvitesPage";
import { LoginPage } from "./pages/LoginPage";
import { MaintenancePage } from "./pages/MaintenancePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PerformancePage } from "./pages/PerformancePage";
import { PluginsPage } from "./pages/PluginsPage";
import { RetentionPage } from "./pages/RetentionPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TlsPage } from "./pages/TlsPage";
import { UsersPage } from "./pages/UsersPage";
import { useAuthStore, useUiStore } from "./stores/stores";

function AppRoutes() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const setTheme = useUiStore((s) => s.setTheme);
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    void bootstrap();
    setTheme(theme);
  }, [bootstrap, setTheme, theme]);

  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/instance" element={<InstancePage />} />
          <Route path="/invites" element={<InvitesPage />} />
          <Route path="/flags" element={<FeatureFlagsPage />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/plugins" element={<PluginsPage />} />
          <Route path="/retention" element={<RetentionPage />} />
          <Route path="/tls" element={<TlsPage />} />
          <Route path="/backup" element={<BackupPage />} />
          <Route path="/performance" element={<PerformancePage />} />
          <Route path="/maintenance" element={<MaintenancePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}
