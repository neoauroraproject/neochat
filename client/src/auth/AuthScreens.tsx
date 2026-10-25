import { useState, type FormEvent } from "react";
import { post, setToken } from "../api";
import { Icon } from "../components/Icon";
import { BrandLogo } from "../components/ui";
import { errorText, useT } from "../i18n";
import { useApp } from "../store";
import type { User } from "../types";

export function LangSwitch() {
  const lang = useApp((s) => s.lang);
  const setLang = useApp((s) => s.setLang);
  return (
    <button className="btn btn-sm lang-switch" onClick={() => setLang(lang === "fa" ? "en" : "fa")}>
      <Icon name="globe" size={16} />
      {lang === "fa" ? "English" : "فارسی"}
    </button>
  );
}

function finish(res: { token: string; user: User }) {
  setToken(res.token);
  useApp.getState().setMe(res.user);
}

export function AuthScreen() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const config = useApp((s) => s.config)!;
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({
    username: "",
    displayName: "",
    password: "",
    password2: "",
    invite: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "register" && form.password !== form.password2)
      return setError(t("auth.passwordMismatch"));
    setBusy(true);
    try {
      const res = await post<{ token: string; user: User }>(
        mode === "login" ? "/api/auth/login" : "/api/auth/register",
        {
          username: form.username.trim().replace(/^@/, ""),
          displayName: form.displayName,
          password: form.password,
          invite: form.invite,
        },
      );
      finish(res);
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  };

  const canRegister = config.registration !== "closed";
  return (
    <div className="auth">
      <LangSwitch />
      <form className="auth-card glass-window" onSubmit={submit}>
        <div className="auth-brand">
          <BrandLogo />
          <h1>{config.appName}</h1>
          <p>{config.tagline || t("app.secure")}</p>
        </div>
        {error && <div className="form-error">{error}</div>}
        {mode === "register" && !canRegister ? (
          <div className="form-error">{t("auth.closed")}</div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="u">{t("auth.username")}</label>
              <div className="input-prefix">
                <span className="ltr">@</span>
                <input
                  id="u"
                  className="input ltr"
                  value={form.username}
                  onChange={set("username")}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  dir="ltr"
                />
              </div>
              {mode === "register" && <span className="hint">{t("auth.usernameHint")}</span>}
            </div>
            {mode === "register" && (
              <div className="field">
                <label htmlFor="d">{t("auth.displayName")}</label>
                <input
                  id="d"
                  className="input"
                  value={form.displayName}
                  onChange={set("displayName")}
                  autoComplete="nickname"
                  maxLength={64}
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="p">{t("auth.password")}</label>
              <input
                id="p"
                className="input ltr"
                type="password"
                value={form.password}
                onChange={set("password")}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                dir="ltr"
                minLength={mode === "register" ? config.minPasswordLen : undefined}
              />
              {mode === "register" && (
                <span className="hint">{t("auth.passwordHint", { n: config.minPasswordLen })}</span>
              )}
            </div>
            {mode === "register" && (
              <div className="field">
                <label htmlFor="p2">{t("auth.passwordRepeat")}</label>
                <input
                  id="p2"
                  className="input ltr"
                  type="password"
                  value={form.password2}
                  onChange={set("password2")}
                  autoComplete="new-password"
                  required
                  dir="ltr"
                />
              </div>
            )}
            {mode === "register" && config.registration === "invite" && (
              <div className="field">
                <label htmlFor="i">{t("auth.invite")}</label>
                <input
                  id="i"
                  className="input ltr"
                  value={form.invite}
                  onChange={set("invite")}
                  autoCapitalize="characters"
                  required
                  dir="ltr"
                />
              </div>
            )}
            <button className="btn btn-primary btn-block" disabled={busy} style={{ marginTop: 6 }}>
              {busy ? (
                <span className="spinner" />
              ) : mode === "login" ? (
                t("auth.login")
              ) : (
                t("auth.register")
              )}
            </button>
          </>
        )}
        {(canRegister || mode === "register") && (
          <div className="auth-switch">
            {mode === "login" ? t("auth.noAccount") : t("auth.haveAccount")}
            <button
              type="button"
              onClick={() => (setMode(mode === "login" ? "register" : "login"), setError(""))}
            >
              {mode === "login" ? t("auth.register") : t("auth.login")}
            </button>
          </div>
        )}
        <div className="auth-note">
          <Icon name="shield" size={15} />
          {t("auth.noPhone")}
        </div>
        <p className="copyright">{t("common.copyright")}</p>
      </form>
    </div>
  );
}

export function SetupScreen() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const config = useApp((s) => s.config)!;
  const [form, setForm] = useState({
    appName: config.appName,
    username: "admin",
    displayName: "",
    password: "",
    password2: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.password2) return setError(t("auth.passwordMismatch"));
    setBusy(true);
    try {
      const res = await post<{ token: string; user: User }>("/api/setup", form);
      useApp
        .getState()
        .setConfig({ ...config, appName: form.appName || config.appName, setupRequired: false });
      finish(res);
    } catch (err) {
      setError(errorText(lang, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <LangSwitch />
      <form className="auth-card glass-window" onSubmit={submit}>
        <div className="auth-brand">
          <BrandLogo />
          <h1>{t("setup.title")}</h1>
          <p>{t("setup.subtitle")}</p>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="field">
          <label htmlFor="a">{t("setup.appName")}</label>
          <input
            id="a"
            className="input"
            value={form.appName}
            onChange={set("appName")}
            maxLength={40}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="u">{t("auth.username")}</label>
          <div className="input-prefix">
            <span>@</span>
            <input
              id="u"
              className="input ltr"
              value={form.username}
              onChange={set("username")}
              autoCapitalize="none"
              autoCorrect="off"
              required
              dir="ltr"
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="d">{t("auth.displayName")}</label>
          <input
            id="d"
            className="input"
            value={form.displayName}
            onChange={set("displayName")}
            maxLength={64}
          />
        </div>
        <div className="field">
          <label htmlFor="p">{t("auth.password")}</label>
          <input
            id="p"
            className="input ltr"
            type="password"
            value={form.password}
            onChange={set("password")}
            autoComplete="new-password"
            required
            minLength={config.minPasswordLen}
            dir="ltr"
          />
          <span className="hint">{t("auth.passwordHint", { n: config.minPasswordLen })}</span>
        </div>
        <div className="field">
          <label htmlFor="p2">{t("auth.passwordRepeat")}</label>
          <input
            id="p2"
            className="input ltr"
            type="password"
            value={form.password2}
            onChange={set("password2")}
            autoComplete="new-password"
            required
            dir="ltr"
          />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? <span className="spinner" /> : t("setup.start")}
        </button>
        <p className="copyright">{t("common.copyright")}</p>
      </form>
    </div>
  );
}
