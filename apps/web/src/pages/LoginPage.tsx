import type { AuthSession, LoginRequest } from "@neochat/shared";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { useI18n } from "../i18n/I18nProvider";
import { apiFetch } from "../lib/api";
import { publishKeyBundle } from "../lib/crypto-session";
import { useAuthStore } from "../stores/stores";

export function LoginPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const loadProfile = useAuthStore((s) => s.loadProfile);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body: LoginRequest = { username, password, deviceName: "Web browser" };
      const session = await apiFetch<AuthSession>("/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSession(session);
      await loadProfile();
      await publishKeyBundle(session.deviceId).catch(() => undefined);
      navigate("/", { replace: true });
    } catch {
      setError(t("auth.signInError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title={t("auth.login")} subtitle={t("auth.login")}>
      <form onSubmit={onSubmit}>
        {error ? <div className="tg-error">{error}</div> : null}
        <div className="tg-field">
          <label htmlFor="username">{t("auth.username")}</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            autoFocus
          />
        </div>
        <div className="tg-field">
          <label htmlFor="password">{t("auth.password")}</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <button type="submit" className="tg-primary" disabled={loading}>
          {loading ? t("common.loading") : t("auth.signIn")}
        </button>
        <Link to="/register" className="tg-link">
          {t("auth.register")}
        </Link>
      </form>
    </AuthLayout>
  );
}
