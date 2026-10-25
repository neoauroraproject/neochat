import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Card, Input, LoadingState, Text, Textarea } from "@neochat/ui";
import type { AuthSession, SetupRequest, SetupStatus } from "@neochat/shared";
import { SUPPORTED_LOCALES } from "@neochat/i18n";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthLayout } from "../components/AuthLayout";
import { useI18n } from "../i18n/I18nProvider";
import { apiFetch } from "../lib/api";
import { useAuthStore } from "../stores/stores";

type Step = "welcome" | "organization" | "administrator" | "httpPort" | "storage" | "finish";

const STEPS: Step[] = ["welcome", "organization", "administrator", "httpPort", "storage", "finish"];

export function SetupPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const loadProfile = useAuthStore((s) => s.loadProfile);
  const [step, setStep] = useState<Step>("welcome");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    instanceName: "NeoChat",
    username: "admin",
    password: "",
    displayName: "Administrator",
    defaultLocale: "en" as const,
    allowOpenRegistration: false,
    httpHost: "0.0.0.0",
    httpPort: 8085,
    storageDriver: "local",
    storagePath: "./data/media",
  });

  const status = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => apiFetch<SetupStatus>("/auth/setup"),
  });

  if (status.isLoading) {
    return <LoadingState message={t("common.loading")} />;
  }

  if (status.data && !status.data.needsSetup) {
    navigate("/login", { replace: true });
    return null;
  }

  const stepIndex = STEPS.indexOf(step);

  function next() {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]!);
  }

  function back() {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]!);
  }

  async function finish() {
    setLoading(true);
    setError(null);
    try {
      const body: SetupRequest = {
        instanceName: form.instanceName,
        admin: {
          username: form.username,
          password: form.password,
          displayName: form.displayName,
        },
        defaultLocale: form.defaultLocale,
        allowOpenRegistration: form.allowOpenRegistration,
        http: {
          host: form.httpHost,
          port: form.httpPort,
        },
        storage: {
          driver: form.storageDriver as "local" | "minio" | "s3" | "memory",
          path: form.storagePath,
          bucket: "neochat-media",
        },
      };
      const session = await apiFetch<AuthSession>("/auth/setup", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSession(session);
      await loadProfile();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.signInError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title={t("auth.setupTitle")} subtitle={stepTitle(step, t)}>
      <div className="space-y-4">
        <div className="flex gap-1">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-[var(--nc-brand)]" : "bg-[var(--nc-border)]"}`}
            />
          ))}
        </div>

        {step === "welcome" && (
          <div className="space-y-4">
            <Text>{t("setup.welcome.subtitle")}</Text>
            <Button type="button" block onClick={next}>
              {t("common.next")}
            </Button>
          </div>
        )}

        {step === "organization" && (
          <div className="space-y-4">
            <Text muted>{t("setup.organization.subtitle")}</Text>
            <Input
              label={t("setup.organization.instanceName")}
              value={form.instanceName}
              onChange={(e) => setForm({ ...form, instanceName: e.target.value })}
              required
            />
            <label className="nc-field">
              <span className="nc-field__label">{t("setup.organization.defaultLocale")}</span>
              <select
                className="nc-input"
                value={form.defaultLocale}
                onChange={(e) =>
                  setForm({ ...form, defaultLocale: e.target.value as typeof form.defaultLocale })
                }
              >
                {SUPPORTED_LOCALES.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--nc-muted)]">
              <input
                type="checkbox"
                checked={form.allowOpenRegistration}
                onChange={(e) => setForm({ ...form, allowOpenRegistration: e.target.checked })}
              />
              {t("setup.organization.allowRegistration")}
            </label>
            <div className="flex gap-2">
              <Button variant="ghost" type="button" onClick={back}>
                {t("common.back")}
              </Button>
              <Button type="button" block onClick={next}>
                {t("common.next")}
              </Button>
            </div>
          </div>
        )}

        {step === "administrator" && (
          <div className="space-y-4">
            <Text muted>{t("setup.administrator.subtitle")}</Text>
            <Input
              label={t("auth.username")}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
            <Input
              label={t("auth.displayName")}
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              required
            />
            <Input
              label={t("auth.password")}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={10}
            />
            <div className="flex gap-2">
              <Button variant="ghost" type="button" onClick={back}>
                {t("common.back")}
              </Button>
              <Button type="button" block onClick={next} disabled={form.password.length < 10}>
                {t("common.next")}
              </Button>
            </div>
          </div>
        )}

        {step === "httpPort" && (
          <div className="space-y-4">
            <Text muted>{t("setup.httpPort.subtitle")}</Text>
            <Input
              label={t("setup.httpPort.host")}
              value={form.httpHost}
              onChange={(e) => setForm({ ...form, httpHost: e.target.value })}
            />
            <Input
              label={t("setup.httpPort.port")}
              type="number"
              value={form.httpPort}
              onChange={(e) => setForm({ ...form, httpPort: Number(e.target.value) })}
            />
            <div className="flex gap-2">
              <Button variant="ghost" type="button" onClick={back}>
                {t("common.back")}
              </Button>
              <Button type="button" block onClick={next}>
                {t("common.next")}
              </Button>
            </div>
          </div>
        )}

        {step === "storage" && (
          <div className="space-y-4">
            <Text muted>{t("setup.storage.subtitle")}</Text>
            <label className="nc-field">
              <span className="nc-field__label">{t("setup.storage.driver")}</span>
              <select
                className="nc-input"
                value={form.storageDriver}
                onChange={(e) => setForm({ ...form, storageDriver: e.target.value })}
              >
                <option value="local">local</option>
                <option value="s3">s3</option>
                <option value="noop">noop</option>
              </select>
            </label>
            <Textarea
              label={t("setup.storage.path")}
              value={form.storagePath}
              onChange={(e) => setForm({ ...form, storagePath: e.target.value })}
              rows={2}
            />
            <div className="flex gap-2">
              <Button variant="ghost" type="button" onClick={back}>
                {t("common.back")}
              </Button>
              <Button type="button" block onClick={next}>
                {t("common.next")}
              </Button>
            </div>
          </div>
        )}

        {step === "finish" && (
          <div className="space-y-4">
            <Text muted>{t("setup.finish.subtitle")}</Text>
            <Card>
              <dl className="text-sm space-y-2">
                <div className="flex justify-between">
                  <dt className="text-[var(--nc-muted)]">{t("setup.organization.instanceName")}</dt>
                  <dd>{form.instanceName}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--nc-muted)]">{t("auth.username")}</dt>
                  <dd>{form.username}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--nc-muted)]">{t("setup.httpPort.port")}</dt>
                  <dd>
                    {form.httpHost}:{form.httpPort}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--nc-muted)]">{t("setup.storage.driver")}</dt>
                  <dd>
                    <Badge tone="brand">{form.storageDriver}</Badge>
                  </dd>
                </div>
              </dl>
            </Card>
            {error ? <Text danger>{error}</Text> : null}
            <div className="flex gap-2">
              <Button variant="ghost" type="button" onClick={back}>
                {t("common.back")}
              </Button>
              <Button type="button" block disabled={loading} onClick={() => void finish()}>
                {loading ? t("common.loading") : t("setup.finish.launch")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}

function stepTitle(step: Step, t: (key: import("@neochat/i18n").MessageKey) => string): string {
  const map: Record<Step, string> = {
    welcome: t("setup.welcome.title"),
    organization: t("setup.organization.title"),
    administrator: t("setup.administrator.title"),
    httpPort: t("setup.httpPort.title"),
    storage: t("setup.storage.title"),
    finish: t("setup.finish.title"),
  };
  return map[step];
}
