import { Button, Input } from "@neochat/ui";
import type { AuthSession, LoginRequest } from "@neochat/shared";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LanguageSwitcher, useI18n } from "../i18n/I18nProvider";
import { apiFetch } from "../lib/api";
import { useAuthStore } from "../stores/stores";

export function LoginPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const setTokensFromLogin = useAuthStore((s) => s.setTokensFromLogin);
  const loadProfile = useAuthStore((s) => s.loadProfile);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body: LoginRequest = { username, password, deviceName: "Admin console" };
      const session = await apiFetch<AuthSession>("/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setTokensFromLogin(session.tokens);
      await loadProfile();
      navigate("/", { replace: true });
    } catch {
      setError(t("auth.signInError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh grid place-items-center p-6 bg-[var(--nc-bg)]">
      <div className="w-full max-w-sm space-y-6">
        <header className="text-center">
          <h1 className="text-2xl font-bold text-[var(--nc-brand)]">{t("app.name")} Admin</h1>
          <p className="text-sm text-[var(--nc-muted)] mt-1">{t("auth.login")}</p>
        </header>
        <form className="nc-card nc-card__body space-y-4" onSubmit={onSubmit}>
          <Input
            label={t("auth.username")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <Input
            label={t("auth.password")}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error ? <p className="text-sm text-[var(--nc-danger)]">{error}</p> : null}
          <Button type="submit" block disabled={loading}>
            {loading ? t("common.loading") : t("auth.signIn")}
          </Button>
        </form>
        <div className="flex justify-center">
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
