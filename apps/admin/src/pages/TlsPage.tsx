import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Input, Spinner } from "@neochat/ui";
import type { TlsConfigResponse, UpdateTlsConfigRequest } from "@neochat/shared";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { apiFetch } from "../lib/api";

export function TlsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [certPem, setCertPem] = useState("");
  const [keyPem, setKeyPem] = useState("");
  const [form, setForm] = useState<UpdateTlsConfigRequest>({
    mode: "off",
    domain: null,
    email: null,
    certPath: null,
    keyPath: null,
    https: { redirectHttp: true, hstsMaxAgeSeconds: 31_536_000 },
  });

  const tls = useQuery({
    queryKey: ["admin-tls"],
    queryFn: () => apiFetch<TlsConfigResponse>("/admin/tls"),
    retry: false,
  });

  useEffect(() => {
    if (tls.data) {
      setForm({
        mode: tls.data.tls.mode,
        domain: tls.data.tls.domain,
        email: tls.data.tls.email,
        certPath: tls.data.tls.certPath,
        keyPath: tls.data.tls.keyPath,
        https: tls.data.https,
      });
    }
  }, [tls.data]);

  const save = useMutation({
    mutationFn: (body: UpdateTlsConfigRequest) =>
      apiFetch("/admin/tls", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-tls"] }),
  });

  const onSave = () => {
    const body: UpdateTlsConfigRequest = { ...form };
    if (form.mode === "custom-cert" && certPem && keyPem) {
      body.certPem = certPem;
      body.keyPem = keyPem;
    }
    save.mutate(body);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("admin.tls")}</h1>
      <p className="text-sm text-[var(--nc-muted)]">
        TLS wizard — configure HTTPS termination and reverse proxy.
      </p>

      <Card title="TLS configuration">
        {tls.isLoading ? (
          <Spinner />
        ) : (
          <div className="space-y-4">
            <label className="nc-field">
              <span className="nc-field__label">Mode</span>
              <select
                className="nc-input"
                value={form.mode}
                onChange={(e) =>
                  setForm({ ...form, mode: e.target.value as UpdateTlsConfigRequest["mode"] })
                }
              >
                <option value="off">off</option>
                <option value="caddy-auto">caddy-auto (ACME)</option>
                <option value="custom-cert">custom-cert</option>
              </select>
            </label>
            {form.mode !== "off" ? (
              <>
                <Input
                  label="Domain"
                  value={form.domain ?? ""}
                  onChange={(e) => setForm({ ...form, domain: e.target.value || null })}
                />
                {form.mode === "caddy-auto" ? (
                  <Input
                    label="ACME email"
                    type="email"
                    value={form.email ?? ""}
                    onChange={(e) => setForm({ ...form, email: e.target.value || null })}
                  />
                ) : null}
                {form.mode === "custom-cert" ? (
                  <>
                    <label className="nc-field">
                      <span className="nc-field__label">Certificate PEM</span>
                      <textarea
                        className="nc-input min-h-24 font-mono text-xs"
                        value={certPem}
                        onChange={(e) => setCertPem(e.target.value)}
                        placeholder="-----BEGIN CERTIFICATE-----"
                      />
                    </label>
                    <label className="nc-field">
                      <span className="nc-field__label">Private key PEM</span>
                      <textarea
                        className="nc-input min-h-24 font-mono text-xs"
                        value={keyPem}
                        onChange={(e) => setKeyPem(e.target.value)}
                        placeholder="-----BEGIN PRIVATE KEY-----"
                      />
                    </label>
                    <Input label="Certificate path (stored)" value={form.certPath ?? ""} readOnly />
                    <Input label="Private key path (stored)" value={form.keyPath ?? ""} readOnly />
                  </>
                ) : null}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.https?.redirectHttp ?? true}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        https: { ...form.https!, redirectHttp: e.target.checked },
                      })
                    }
                  />
                  Redirect HTTP to HTTPS
                </label>
              </>
            ) : null}
            <Button type="button" onClick={onSave} disabled={save.isPending}>
              Save TLS config
            </Button>
          </div>
        )}
      </Card>

      {tls.data?.certValidation ? (
        <Card title="Certificate validation">
          <p className="text-sm">{tls.data.certValidation.valid ? "Valid" : "Invalid"}</p>
          {tls.data.certValidation.daysUntilExpiry != null ? (
            <p className="text-xs text-[var(--nc-muted)]">
              Expires in {tls.data.certValidation.daysUntilExpiry} day(s)
            </p>
          ) : null}
          {tls.data.certValidation.errors?.map((e) => (
            <p key={e} className="text-xs text-red-500">
              {e}
            </p>
          ))}
        </Card>
      ) : null}

      {tls.data?.dnsHints?.length ? (
        <Card title="DNS hints">
          <ul className="text-sm list-disc ps-5 space-y-1">
            {tls.data.dnsHints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {tls.data?.portHints?.length ? (
        <Card title="Port validation">
          <ul className="text-sm list-disc ps-5 space-y-1">
            {tls.data.portHints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {tls.data?.reverseProxy ? (
        <Card title="Reverse proxy">
          <p className="text-sm mb-2">Stage: {tls.data.reverseProxy.stage}</p>
          <ul className="text-xs text-[var(--nc-muted)] list-disc ps-5 space-y-1 mb-3">
            {tls.data.reverseProxy.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="text-sm font-medium">Deployment verification checklist</p>
          <ul className="text-xs list-disc ps-5 space-y-1">
            {tls.data.reverseProxy.verificationChecklist.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {tls.data?.caddyfileHint ? (
        <Card title="Caddyfile snippet">
          <pre className="text-xs overflow-x-auto p-3 bg-[var(--nc-bg)] rounded-md">
            {tls.data.caddyfileHint}
          </pre>
        </Card>
      ) : null}
    </div>
  );
}
