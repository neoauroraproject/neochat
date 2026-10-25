import type { AuthSession, RegisterRequest } from "@neochat/shared";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { useI18n } from "../i18n/I18nProvider";
import { apiFetch } from "../lib/api";
import { publishKeyBundle } from "../lib/crypto-session";
import { useAuthStore } from "../stores/stores";

export function RegisterPage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const loadProfile = useAuthStore((s) => s.loadProfile);
  const [form, setForm] = useState({ username: "", password: "", displayName: "", inviteCode: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body: RegisterRequest = {
        username: form.username,
        password: form.password,
        displayName: form.displayName,
        inviteCode: form.inviteCode || undefined,
        locale,
      };
      const session = await apiFetch<AuthSession>("/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSession(session);
      await loadProfile();
      await publishKeyBundle(session.deviceId).catch(() => undefined);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title={t("auth.register")} subtitle={t("auth.register")}>
      <form onSubmit={onSubmit}>
        {error ? <div className="tg-error">{error}</div> : null}
        <div className="tg-field">
          <label htmlFor="reg-username">{t("auth.username")}</label>
          <input
            id="reg-username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />
        </div>
        <div className="tg-field">
          <label htmlFor="reg-display">{t("auth.displayName")}</label>
          <input
            id="reg-display"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            required
          />
        </div>
        <div className="tg-field">
          <label htmlFor="reg-password">{t("auth.password")}</label>
          <input
            id="reg-password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength={10}
          />
        </div>
        <div className="tg-field">
          <label htmlFor="reg-invite">{t("auth.inviteCode")}</label>
          <input
            id="reg-invite"
            value={form.inviteCode}
            onChange={(e) => setForm({ ...form, inviteCode: e.target.value })}
          />
        </div>
        <button type="submit" className="tg-primary" disabled={loading}>
          {loading ? t("common.loading") : t("auth.register")}
        </button>
        <Link to="/login" className="tg-link">
          {t("auth.login")}
        </Link>
      </form>
    </AuthLayout>
  );
}
