import { lazy, Suspense, useEffect, useState } from "react";
import { get, getToken, mediaUrl, setToken, setUnauthorizedHandler } from "./api";
import { AppShell } from "./app/AppShell";
import { useMedia } from "./app/hooks";
import { AuthScreen, SetupScreen } from "./auth/AuthScreens";
import { Toasts } from "./components/ui";
import { useApp } from "./store";
import type { PublicConfig, User } from "./types";
import { connect, disconnect } from "./ws";
import "./call";

const AdminApp = lazy(() => import("./admin/AdminApp"));

/** Applies branding, language direction and theme to the document. */
function useDocumentTheme() {
  const config = useApp((s) => s.config);
  const lang = useApp((s) => s.lang);
  const theme = useApp((s) => s.theme);
  const prefersLight = useMedia("(prefers-color-scheme: light)");
  const resolved = theme === "auto" ? (prefersLight ? "light" : "dark") : theme || "dark";
  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang || "fa";
    root.dir = lang === "en" ? "ltr" : "rtl";
    root.dataset.theme = resolved;
    if (config?.accentColor) root.style.setProperty("--accent", config.accentColor);
    if (config?.appName) document.title = config.appName;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", resolved === "light" ? "#efe6dc" : "#16110e");
  }, [config, lang, resolved]);
}

function Scene() {
  const bg = useApp((s) => s.config?.backgroundMedia);
  return (
    <div
      className={`scene${bg ? " has-image" : ""}`}
      style={bg ? ({ "--bg-image": `url(${mediaUrl(bg)})` } as React.CSSProperties) : undefined}
    />
  );
}

export default function App() {
  const config = useApp((s) => s.config);
  const me = useApp((s) => s.me);
  const [bootError, setBootError] = useState(false);
  const isAdmin = location.pathname.startsWith("/admin");
  useDocumentTheme();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken("");
      disconnect();
      useApp.setState({ me: null });
    });
    const boot = async () => {
      try {
        const cfg = await get<PublicConfig>("/api/config");
        useApp.getState().setConfig(cfg);
        try {
          localStorage.setItem("neochat.config", JSON.stringify(cfg));
        } catch {
          /* ignore */
        }
      } catch {
        // Offline start: use the last known config so cached chats can still be read.
        try {
          const cached = localStorage.getItem("neochat.config");
          if (cached) useApp.getState().setConfig(JSON.parse(cached));
          else setBootError(true);
        } catch {
          setBootError(true);
        }
      }
      if (getToken()) {
        try {
          useApp.getState().setMe(await get<User>("/api/me"));
        } catch (e) {
          // Network failure: keep the session and show cached data; 401 is handled above.
          if ((e as { status?: number }).status === 0) {
            const cachedMe = localStorage.getItem("neochat.me");
            if (cachedMe) useApp.getState().setMe(JSON.parse(cachedMe));
          }
        }
      }
    };
    boot();
  }, []);

  useEffect(() => {
    if (!me) return;
    try {
      localStorage.setItem("neochat.me", JSON.stringify(me));
    } catch {
      /* ignore */
    }
    connect();
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  let body: React.ReactNode;
  if (bootError && !config) {
    body = (
      <div className="auth">
        <div className="auth-card glass-window" style={{ textAlign: "center" }}>
          <h2>NeoChat</h2>
          <p style={{ color: "var(--text-2)" }}>
            Cannot reach the server · اتصال به سرور برقرار نشد
          </p>
          <button className="btn btn-primary" onClick={() => location.reload()}>
            ↻
          </button>
        </div>
      </div>
    );
  } else if (!config) {
    body = null;
  } else if (config.setupRequired) {
    body = <SetupScreen />;
  } else if (!me) {
    body = <AuthScreen />;
  } else if (isAdmin) {
    body = (
      <Suspense fallback={null}>
        <AdminApp />
      </Suspense>
    );
  } else {
    body = <AppShell />;
  }

  return (
    <>
      <Scene />
      {body}
      <Toasts />
    </>
  );
}
