import { useEffect, useState } from "react";
import { del, get, patch, post, upload } from "../api";
import { clearAllCaches } from "../cache";
import { Icon } from "../components/Icon";
import { Avatar, Modal, Toggle, pickFile } from "../components/ui";
import { listStamp, num } from "../format";
import { errorText, useT } from "../i18n";
import { getPref, setPref } from "../notify";
import { useApp } from "../store";
import type { User } from "../types";
import { LargeTitleScreen } from "./Panes";

interface Session {
  id: number;
  userAgent: string;
  ip: string;
  createdAt: number;
  lastUsed: number;
  current: boolean;
}

let installPrompt: (Event & { prompt(): void }) | null = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e as Event & { prompt(): void };
});

const deviceName = (ua: string) => {
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  const br = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  return [br, os].filter(Boolean).join(" · ");
};

export function SettingsPane() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const theme = useApp((s) => s.theme);
  const me = useApp((s) => s.me)!;
  const config = useApp((s) => s.config);
  const [profile, setProfile] = useState({
    displayName: me.displayName,
    username: me.username,
    bio: me.bio,
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [pwOpen, setPwOpen] = useState(false);
  const [notify, setNotify] = useState(
    getPref("notify") &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted",
  );
  const [sound, setSound] = useState(getPref("sound"));

  const loadSessions = () =>
    get<Session[]>("/api/me/sessions")
      .then(setSessions)
      .catch(() => {});
  useEffect(() => {
    loadSessions();
  }, []);

  const save = async (body: Partial<User> & Record<string, unknown>) => {
    setError("");
    try {
      const u = await patch<User>("/api/me", body);
      useApp.getState().setMe(u);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(errorText(lang, e));
    }
  };

  const changePhoto = async () => {
    const f = await pickFile("image/*");
    if (!f) return;
    try {
      const m = await upload(f);
      save({ avatar: m.id });
    } catch (e) {
      setError(errorText(lang, e));
    }
  };

  const enableNotify = async (v: boolean) => {
    if (v && "Notification" in window && Notification.permission !== "granted") {
      const p = await Notification.requestPermission();
      if (p !== "granted") return;
    }
    setPref("notify", v);
    setNotify(v);
  };

  const dirty =
    profile.displayName !== me.displayName ||
    profile.username !== me.username ||
    profile.bio !== me.bio;

  return (
    <div className="settings-pane">
      <LargeTitleScreen title={t("settings.title")} grouped>
        <div className="settings-inner">
          <div className="me-card">
            <div className="avatar-edit">
              <Avatar id={me.id} name={me.displayName} media={me.avatar} size={96} />
              <button
                className="icon-btn accent"
                onClick={changePhoto}
                aria-label={t("settings.changePhoto")}
              >
                <Icon name="camera" size={16} />
              </button>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{me.displayName}</div>
              <div className="ltr" style={{ color: "var(--text-2)" }}>
                @{me.username}
              </div>
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}
          <div className="section-label">{t("settings.profile")}</div>
          <div className="card-group form-group">
            <div className="field">
              <label>{t("auth.displayName")}</label>
              <input
                className="input"
                value={profile.displayName}
                onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                maxLength={64}
              />
            </div>
            <div className="field">
              <label>{t("auth.username")}</label>
              <div className="input-prefix">
                <span>@</span>
                <input
                  className="input ltr"
                  dir="ltr"
                  value={profile.username}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      username: e.target.value.replace(/[^a-zA-Z0-9_]/g, ""),
                    })
                  }
                  maxLength={32}
                  autoCapitalize="none"
                />
              </div>
              <span className="hint">{t("auth.usernameHint")}</span>
            </div>
            <div className="field">
              <label>{t("settings.bio")}</label>
              <textarea
                className="textarea"
                value={profile.bio}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                maxLength={300}
                rows={2}
              />
            </div>
            {(dirty || saved) && (
              <div style={{ display: "flex", justifyContent: "flex-end", paddingBottom: 14 }}>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!dirty}
                  onClick={() => save(profile)}
                >
                  {saved ? <Icon name="check" size={16} /> : null}
                  {saved ? t("common.saved") : t("common.save")}
                </button>
              </div>
            )}
          </div>

          <div className="section-label">{t("settings.privacy")}</div>
          <div className="card-group">
            <div className="item">
              <span className="item-icon" style={{ background: "#5e5ce6" }}>
                <Icon name="clock" size={18} />
              </span>
              <div className="grow">
                <div>{t("settings.hideLastSeen")}</div>
                <div className="muted">{t("settings.hideLastSeenHint")}</div>
              </div>
              <Toggle
                checked={!!me.hideLastSeen}
                onChange={(v) => save({ hideLastSeen: v })}
                label={t("settings.hideLastSeen")}
              />
            </div>
            <button className="item" onClick={() => setPwOpen(true)}>
              <span className="item-icon" style={{ background: "#ff9f0a" }}>
                <Icon name="lock" size={18} />
              </span>
              <div className="grow">{t("settings.password")}</div>
              <Icon name="forward" size={18} className="flip-rtl" />
            </button>
          </div>

          <div className="section-label">{t("settings.appearance")}</div>
          <div className="card-group">
            <div className="item">
              <span className="item-icon" style={{ background: "#0a84ff" }}>
                <Icon name="globe" size={18} />
              </span>
              <div className="grow">{t("settings.language")}</div>
              <div className="segmented" style={{ width: 170 }}>
                <button
                  aria-pressed={lang === "fa"}
                  onClick={() => useApp.getState().setLang("fa")}
                >
                  فارسی
                </button>
                <button
                  aria-pressed={lang === "en"}
                  onClick={() => useApp.getState().setLang("en")}
                >
                  English
                </button>
              </div>
            </div>
            <div className="item" style={{ flexWrap: "wrap" }}>
              <span className="item-icon" style={{ background: "#636366" }}>
                <Icon name="moon" size={18} />
              </span>
              <div className="grow">{t("settings.theme")}</div>
              <div className="segmented" style={{ width: 230 }}>
                {(["dark", "light", "auto"] as const).map((th) => (
                  <button
                    key={th}
                    aria-pressed={theme === th}
                    onClick={() => useApp.getState().setTheme(th)}
                  >
                    {t(
                      th === "dark"
                        ? "settings.themeDark"
                        : th === "light"
                          ? "settings.themeLight"
                          : "settings.themeAuto",
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="section-label">{t("settings.notifications")}</div>
          <div className="card-group">
            <div className="item">
              <span className="item-icon" style={{ background: "#ff375f" }}>
                <Icon name="bell" size={18} />
              </span>
              <div className="grow">{t("settings.enableNotifications")}</div>
              <Toggle checked={notify} onChange={enableNotify} />
            </div>
            <div className="item">
              <span className="item-icon" style={{ background: "#30d158" }}>
                <Icon name="speaker" size={18} />
              </span>
              <div className="grow">{t("settings.sound")}</div>
              <Toggle
                checked={sound}
                onChange={(v) => {
                  setPref("sound", v);
                  setSound(v);
                }}
              />
            </div>
          </div>

          <div className="section-label">{t("settings.sessions")}</div>
          <div className="card-group">
            {sessions.map((s) => (
              <div key={s.id} className="item">
                <span
                  className="item-icon"
                  style={{ background: s.current ? "#30d158" : "#48484a" }}
                >
                  <Icon name="server" size={18} />
                </span>
                <div className="grow">
                  <div>
                    {deviceName(s.userAgent)}{" "}
                    {s.current && <span className="chip success">{t("settings.thisDevice")}</span>}
                  </div>
                  <div className="muted">
                    <span className="ltr">{s.ip}</span> · {listStamp(s.lastUsed, lang)}
                  </div>
                </div>
                {!s.current && (
                  <button
                    className="btn btn-sm"
                    onClick={() => del(`/api/me/sessions/${s.id}`).then(loadSessions)}
                  >
                    {t("settings.terminate")}
                  </button>
                )}
              </div>
            ))}
            {sessions.length > 1 && (
              <button
                className="item"
                style={{ color: "var(--danger)" }}
                onClick={() => del("/api/me/sessions/others").then(loadSessions)}
              >
                <Icon name="x" size={18} />
                {t("settings.terminateOthers")}
              </button>
            )}
          </div>

          <div className="section-label">{t("settings.storage")}</div>
          <div className="card-group">
            <div className="item">
              <span className="item-icon" style={{ background: "#64d2ff" }}>
                <Icon name="database" size={18} />
              </span>
              <div className="grow muted">
                {t("settings.cacheInfo", { n: num(config?.clientCacheMessages ?? 200, lang) })}
              </div>
            </div>
            <button
              className="item"
              onClick={async () => {
                await clearAllCaches();
                useApp.getState().toast(t("settings.cacheCleared"));
              }}
            >
              <Icon name="trash" size={18} />
              {t("settings.clearCache")}
            </button>
            {installPrompt && (
              <button className="item" onClick={() => installPrompt?.prompt()}>
                <Icon name="download" size={18} />
                <div className="grow">
                  <div>{t("settings.install")}</div>
                  <div className="muted">{t("settings.installHint")}</div>
                </div>
              </button>
            )}
          </div>

          <div className="card-group">
            {me.isAdmin && (
              <a className="item" href="/admin" style={{ color: "var(--text)" }}>
                <span className="item-icon" style={{ background: "var(--accent)" }}>
                  <Icon name="dashboard" size={18} />
                </span>
                <div className="grow">{t("nav.admin")}</div>
                <Icon name="forward" size={18} className="flip-rtl" />
              </a>
            )}
            <button
              className="item"
              style={{ color: "var(--danger)" }}
              onClick={() => confirm(t("common.confirm")) && useApp.getState().logout()}
            >
              <Icon name="logout" size={18} />
              {t("settings.logout")}
            </button>
          </div>
          <p style={{ textAlign: "center", color: "var(--text-3)", fontSize: 12.5 }}>
            {config?.appName} · {t("settings.version", { v: config?.version || "" })}
            <br />
            {t("common.copyright")} · {t("common.poweredBy")}
          </p>
        </div>
        {pwOpen && <PasswordModal onClose={() => setPwOpen(false)} />}
      </LargeTitleScreen>
    </div>
  );
}

function PasswordModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const min = useApp((s) => s.config?.minPasswordLen ?? 8);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [error, setError] = useState("");
  const submit = async () => {
    if (next !== next2) return setError(t("auth.passwordMismatch"));
    try {
      await post("/api/me/password", { current: cur, new: next });
      useApp.getState().toast(t("settings.passwordChanged"));
      onClose();
    } catch (e) {
      setError(errorText(lang, e));
    }
  };
  return (
    <Modal
      title={t("settings.password")}
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={submit} disabled={!cur || next.length < min}>
          {t("common.save")}
        </button>
      }
    >
      {error && <div className="form-error">{error}</div>}
      <div className="field">
        <label>{t("settings.currentPassword")}</label>
        <input
          className="input ltr"
          dir="ltr"
          type="password"
          value={cur}
          onChange={(e) => setCur(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      <div className="field">
        <label>{t("settings.newPassword")}</label>
        <input
          className="input ltr"
          dir="ltr"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
        />
        <span className="hint">{t("auth.passwordHint", { n: min })}</span>
      </div>
      <div className="field">
        <label>{t("auth.passwordRepeat")}</label>
        <input
          className="input ltr"
          dir="ltr"
          type="password"
          value={next2}
          onChange={(e) => setNext2(e.target.value)}
          autoComplete="new-password"
        />
      </div>
    </Modal>
  );
}
