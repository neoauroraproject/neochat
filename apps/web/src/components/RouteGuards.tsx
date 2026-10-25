import { Navigate, Outlet } from "react-router-dom";
import { Spinner } from "@neochat/ui";
import { useAuthStore } from "../stores/stores";

export function ProtectedRoute() {
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const user = useAuthStore((s) => s.user);

  if (!bootstrapped) {
    return (
      <div className="min-h-dvh grid place-items-center">
        <Spinner />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function GuestRoute() {
  const bootstrapped = useAuthStore((s) => s.bootstrapped);
  const user = useAuthStore((s) => s.user);

  if (!bootstrapped) {
    return (
      <div className="min-h-dvh grid place-items-center">
        <Spinner />
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}
