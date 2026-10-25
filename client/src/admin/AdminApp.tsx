import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { BrandLogo } from "../components/ui";
import { useApp } from "../store";
import "./admin.css";
import { AdsPage } from "./AdsPage";
import { DashboardPage, SystemPage } from "./DashboardPage";
import { useL } from "./l10n";
import { COPYRIGHT } from "../ads";
import { InvitesPage, RoomsPage, UsersPage } from "./ManagePages";
import { SettingsPage } from "./SettingsPage";
import { TlsPage } from "./TlsPage";

type Page =
  | "dashboard"
  | "users"
  | "rooms"
  | "ads"
  | "invites"
  | "branding"
  | "access"
  | "limits"
  | "calls"
  | "ssl"
  | "system";

export default function AdminApp() {
  const L = useL();
  const me = useApp((s) => s.me);
  const config = useApp((s) => s.config);
  const [page, setPage] = useState<Page>(() => (location.hash.slice(1) as Page) || "dashboard");
  useEffect(() => {
    const onHash = () => setPage((location.hash.slice(1) as Page) || "dashboard");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = (p: Page) => {
    setPage(p);
    history.replaceState(null, "", `#${p}`);
  };

  if (!me?.isAdmin) {
    return (
      <div className="auth">
        <div className="auth-card glass-window" style={{ textAlign: "center" }}>
          <h2>{L("دسترسی ندارید", "Access denied")}</h2>
          <p style={{ color: "var(--text-2)" }}>
            {L("این بخش فقط برای مدیران سرور است.", "This area is for server administrators only.")}
          </p>
          <a className="btn btn-primary" href="/">
            {L("بازگشت به پیام‌رسان", "Back to messenger")}
          </a>
        </div>
      </div>
    );
  }

  const nav: { id: Page; icon: string; label: string }[] = [
    { id: "dashboard", icon: "dashboard", label: L("داشبورد", "Dashboard") },
    { id: "users", icon: "users", label: L("کاربران", "Users") },
    { id: "rooms", icon: "group", label: L("گروه‌ها و کانال‌ها", "Groups & channels") },
    { id: "ads", icon: "ad", label: L("تبلیغات", "Advertising") },
    { id: "invites", icon: "ticket", label: L("کدهای دعوت", "Invite codes") },
    { id: "branding", icon: "palette", label: L("برندینگ", "Branding") },
    { id: "access", icon: "shield", label: L("ثبت‌نام و امنیت", "Registration & security") },
    { id: "limits", icon: "sliders", label: L("محدودیت‌ها و ذخیره‌سازی", "Limits & storage") },
    { id: "calls", icon: "phone", label: L("تماس و شبکه", "Calls & network") },
    { id: "ssl", icon: "lock", label: "SSL / HTTPS" },
    { id: "system", icon: "server", label: L("سیستم و پشتیبان", "System & backup") },
  ];

  return (
    <div className="admin-shell">
      <div className="admin-window glass-window">
        <nav className="pane panel admin-nav">
          <div className="brand">
            <BrandLogo size={40} />
            <div>
              <b>{config?.appName}</b>
              <span>{L("پنل مدیریت", "Admin panel")}</span>
            </div>
          </div>
          {nav.map((n) => (
            <button
              key={n.id}
              className="side-item"
              aria-current={page === n.id}
              onClick={() => go(n.id)}
            >
              <span className="ic">
                <Icon name={n.icon} size={18} />
              </span>
              <span className="grow">{n.label}</span>
            </button>
          ))}
          <div className="spacer" style={{ flex: 1 }} />
          <a className="side-item" href="/" style={{ color: "var(--text)" }}>
            <span className="ic">
              <Icon name="chat" size={18} />
            </span>
            <span className="grow">{L("بازگشت به پیام‌رسان", "Back to messenger")}</span>
          </a>
          <p className="copyright">{COPYRIGHT}</p>
        </nav>
        <main className="pane panel admin-main">
          {page === "dashboard" && <DashboardPage />}
          {page === "users" && <UsersPage />}
          {page === "rooms" && <RoomsPage />}
          {page === "ads" && <AdsPage />}
          {page === "invites" && <InvitesPage />}
          {(page === "branding" || page === "access" || page === "limits" || page === "calls") && (
            <SettingsPage section={page} />
          )}
          {page === "ssl" && <TlsPage />}
          {page === "system" && <SystemPage />}
        </main>
      </div>
    </div>
  );
}
