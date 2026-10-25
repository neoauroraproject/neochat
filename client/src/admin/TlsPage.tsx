import { useEffect, useState } from "react";
import { get, put } from "../api";
import { Icon } from "../components/Icon";
import { errorText } from "../i18n";
import { useApp } from "../store";
import { useL } from "./l10n";

interface TlsStatus {
  mode: "self-signed" | "custom" | "letsencrypt" | "off";
  domain?: string;
  email?: string;
  hosts?: string;
  error?: string;
  https: boolean;
  certificate?: {
    subject: string;
    issuer: string;
    notAfter: number;
    names: string[];
    daysLeft: number;
  };
}

export function TlsPage() {
  const L = useL();
  const lang = useApp((s) => s.lang);
  const [st, setSt] = useState<TlsStatus | null>(null);
  const [mode, setMode] = useState<TlsStatus["mode"]>("self-signed");
  const [form, setForm] = useState({ domain: "", email: "", hosts: "", cert: "", key: "" });
  const [busy, setBusy] = useState(false);

  const load = (s: TlsStatus) => {
    setSt(s);
    setMode(s.mode === "off" ? "self-signed" : s.mode);
    setForm((f) => ({
      ...f,
      domain: s.domain || "",
      email: s.email || "",
      hosts: s.hosts || "",
      cert: "",
      key: "",
    }));
  };
  useEffect(() => {
    get<TlsStatus>("/api/admin/tls")
      .then(load)
      .catch(() => {});
  }, []);

  const save = async (regenerate = false) => {
    setBusy(true);
    try {
      load(await put<TlsStatus>("/api/admin/tls", { mode, ...form, regenerate }));
      useApp
        .getState()
        .toast(
          L("گواهی اعمال شد — بدون نیاز به ری‌استارت", "Certificate applied — no restart needed"),
        );
    } catch (e) {
      useApp.getState().toast(errorText(lang, e), "error");
    } finally {
      setBusy(false);
    }
  };

  const readFile = (k: "cert" | "key") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setForm({ ...form, [k]: await f.text() });
  };

  if (!st) return <span className="spinner" />;
  const c = st.certificate;
  const fmt = (ms: number) =>
    new Intl.DateTimeFormat(lang === "fa" ? "fa-IR" : "en-US", { dateStyle: "long" }).format(ms);
  const modes = [
    {
      id: "self-signed",
      icon: "shield",
      title: L("خودامضا", "Self-signed"),
      desc: L("کاملاً آفلاین. مرورگر یک بار هشدار می‌دهد.", "Fully offline. Browsers warn once."),
    },
    {
      id: "custom",
      icon: "file",
      title: L("آپلود گواهی", "Upload certificate"),
      desc: L("گواهی سازمان یا هر CA دیگر (PEM).", "Your organization’s or any CA (PEM)."),
    },
    {
      id: "letsencrypt",
      icon: "globe",
      title: "Let's Encrypt",
      desc: L(
        "رایگان و خودکار؛ دامنه باید به این سرور اشاره کند.",
        "Free and automatic; the domain must point here.",
      ),
    },
  ] as const;

  return (
    <>
      <h1>SSL / HTTPS</h1>
      <p className="lead">
        {L(
          "گواهی امنیتی سرور را از همین‌جا تنظیم کنید. تماس صوتی و تصویری فقط روی HTTPS کار می‌کند.",
          "Manage the server certificate here. Voice and video calls only work over HTTPS.",
        )}
      </p>

      {!st.https && (
        <div className="form-error">
          {L(
            "سرور با پرچم ‎-self-signed=false‎ و بدون گواهی اجرا شده (حالت توسعه). برای مدیریت SSL آن را بدون این پرچم اجرا کنید.",
            "The server runs in plain-HTTP development mode (-self-signed=false). Start it without that flag to manage SSL.",
          )}
        </div>
      )}

      {c && (
        <div className="settings-section">
          <h2>
            <Icon name="lock" size={18} />
            {L("گواهی فعلی", "Current certificate")}
            <span className={`chip ${c.daysLeft > 14 ? "success" : "danger"}`}>
              {L(`${c.daysLeft} روز اعتبار`, `${c.daysLeft} days left`)}
            </span>
          </h2>
          <dl className="kv" style={{ margin: "12px 0 16px" }}>
            <dt>{L("صادرکننده", "Issuer")}</dt>
            <dd>{c.issuer || "—"}</dd>
            <dt>{L("انقضا", "Expires")}</dt>
            <dd>{fmt(c.notAfter)}</dd>
            <dt>{L("نام‌ها", "Names")}</dt>
            <dd>
              {c.names.slice(0, 8).map((n) => (
                <span
                  key={n}
                  className="code"
                  style={{ margin: "0 4px 4px 0", display: "inline-block" }}
                >
                  {n}
                </span>
              ))}
            </dd>
          </dl>
        </div>
      )}
      {st.error && <div className="form-error">{st.error}</div>}

      <div className="settings-section">
        <h2>
          <Icon name="sliders" size={18} />
          {L("نوع گواهی", "Certificate type")}
        </h2>
        <div className="stat-grid" style={{ marginTop: 12 }}>
          {modes.map((m) => (
            <button
              key={m.id}
              className="stat"
              style={{
                textAlign: "start",
                outline: mode === m.id ? "2px solid var(--accent)" : "none",
              }}
              onClick={() => setMode(m.id)}
              disabled={!st.https}
            >
              <div className="k">
                <Icon name={m.icon} size={16} />
                {m.title}
              </div>
              <div className="s" style={{ marginTop: 6 }}>
                {m.desc}
              </div>
            </button>
          ))}
        </div>

        {mode === "self-signed" && (
          <div className="field">
            <label>
              {L("نام‌ها/آی‌پی‌های اضافه (با کاما)", "Extra names / IPs (comma separated)")}
            </label>
            <input
              className="input ltr"
              dir="ltr"
              value={form.hosts}
              onChange={(e) => setForm({ ...form, hosts: e.target.value })}
              placeholder="chat.local, 10.0.0.5"
            />
            <span className="hint">
              {L("آی‌پی‌های محلی خودکار اضافه می‌شوند.", "Local IPs are included automatically.")}
            </span>
          </div>
        )}
        {mode === "custom" && (
          <div className="form-grid">
            <div className="field">
              <label>{L("گواهی (PEM، همراه زنجیره)", "Certificate (PEM, with chain)")}</label>
              <textarea
                className="textarea ltr code"
                dir="ltr"
                rows={6}
                value={form.cert}
                onChange={(e) => setForm({ ...form, cert: e.target.value })}
                placeholder="-----BEGIN CERTIFICATE-----"
              />
              <input type="file" accept=".pem,.crt,.cer" onChange={readFile("cert")} />
            </div>
            <div className="field">
              <label>{L("کلید خصوصی (PEM)", "Private key (PEM)")}</label>
              <textarea
                className="textarea ltr code"
                dir="ltr"
                rows={6}
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
                placeholder="-----BEGIN PRIVATE KEY-----"
              />
              <input type="file" accept=".pem,.key" onChange={readFile("key")} />
            </div>
          </div>
        )}
        {mode === "letsencrypt" && (
          <div className="form-grid">
            <div className="field">
              <label>{L("دامنه", "Domain")}</label>
              <input
                className="input ltr"
                dir="ltr"
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
                placeholder="chat.example.com"
              />
              <span className="hint">
                {L(
                  "سرور باید روی پورت ۴۴۳ (یا ۸۰) از اینترنت در دسترس باشد.",
                  "The server must be reachable on port 443 (or 80).",
                )}
              </span>
            </div>
            <div className="field">
              <label>{L("ایمیل (اختیاری)", "Email (optional)")}</label>
              <input
                className="input ltr"
                dir="ltr"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, paddingBottom: 16 }}>
          <button className="btn btn-primary" disabled={busy || !st.https} onClick={() => save()}>
            {busy ? <span className="spinner" /> : <Icon name="check" size={18} />}
            {L("اعمال", "Apply")}
          </button>
          {mode === "self-signed" && (
            <button className="btn" disabled={busy || !st.https} onClick={() => save(true)}>
              <Icon name="flip" size={16} />
              {L("ساخت دوباره گواهی", "Regenerate")}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
