import { Navigate, Route, Routes } from "react-router-dom";
import { LoadingState, ToastProvider } from "@neochat/ui";
import type { SetupStatus } from "@neochat/shared";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { MainShell } from "./components/MainShell";
import { GuestRoute, ProtectedRoute } from "./components/RouteGuards";
import { I18nProvider } from "./i18n/I18nProvider";
import { apiFetch } from "./lib/api";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupPage } from "./pages/SetupPage";
import { useAuthStore, useUiStore } from "./stores/stores";

function SetupGate({ children }: { children: React.ReactNode }) {
  const status = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => apiFetch<SetupStatus>("/auth/setup"),
  });

  if (status.isLoading) {
    return <LoadingState />;
  }

  if (status.data?.needsSetup) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

function AppBootstrap() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const applyResolvedTheme = useUiStore((s) => s.applyResolvedTheme);

  useEffect(() => {
    void bootstrap();
    applyResolvedTheme();
  }, [bootstrap, applyResolvedTheme]);

  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route
        element={
          <SetupGate>
            <GuestRoute />
          </SetupGate>
        }
      >
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route
        element={
          <SetupGate>
            <ProtectedRoute />
          </SetupGate>
        }
      >
        <Route path="/" element={<MainShell />} />
        <Route path="/settings" element={<SettingsPage />} />
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
          <AppBootstrap />
        </ToastProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}
