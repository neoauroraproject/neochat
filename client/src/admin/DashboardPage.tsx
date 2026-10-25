import { useEffect, useState } from "react";
import { adHref, adsFor, adTarget } from "../ads";
import { get, getToken } from "../api";
import { Icon } from "../components/Icon";
import { fileSize, num } from "../format";
import { useApp } from "../store";
import { useL } from "./l10n";

interface Stats {
  users: number;
  bannedUsers: number;
  newUsers24h: number;
  active24h: number;
  messages: number;
  messages24h: number;
  directChats: number;
  groups: number;
  channels: number;
  mediaFiles: number;
  mediaBytes: number;
  calls24h: number;
  adClicks: number;
  adImpressions: number;
  online: number;
  activeCalls: number;
  dbBytes: number;
  series: { day: string; messages: number; signups: number }[];
}

function Bars({ data, label }: { data: { day: string; value: number }[]; label: string }) {
  const lang = useApp((s) => s.lang);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="chart-card">
      <h3>{label}</h3>
      <div className="bars" dir="ltr">
        {data.map((d) => (
          <div className="b" key={d.day} title={`${d.day}: ${d.value}`}>
            <i style={{ height: `${(d.value / max) * 100}%` }} />
            <span>
              {new Intl.DateTimeFormat(lang === "fa" ? "fa-IR" : "en-US", {
                day: "numeric",
              }).format(new Date(d.day))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** NeoAurora network ad on the admin dashboard (placement "admin"), from the server's persistent cache. */
function AdminAd() {
  const ad = useApp((s) => adsFor(s.ads, "admin")[0]);
  const L = useL();
  useEffect(() => {
    if (!useApp.getState().ads.length) useApp.getState().loadAds();
  }, []);
  if (!ad) return null;
  return (
    <a
      className="ad-card admin-ad"
      href={adHref(ad)}
      target={adTarget(ad)}
      rel="noopener noreferrer"
    >
      <span
        className="item-icon"
        style={{ background: "var(--accent)", width: 44, height: 44, borderRadius: 14 }}
      >
        <Icon name="ad" size={20} />
      </span>
      <div className="grow">
        <div className="t">{ad.title}</div>
        {ad.body && <div className="b">{ad.body}</div>}
      </div>
      {ad.cta && <span className="btn btn-sm btn-primary">{ad.cta}</span>}
      <span className="tag">{ad.badge || L("تبلیغ", "Sponsored")}</span>
    </a>
  );
}

export function DashboardPage() {
  const L = useL();
  const lang = useApp((s) => s.lang);
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => {
    const load = () =>
      get<Stats>("/api/admin/stats")
        .then(setS)
        .catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);
  if (!s) return <span className="spinner" />;
  const n = (v: number) => num(v, lang);
  const tiles = [
    {
      icon: "users",
      k: L("کاربران", "Users"),
      v: n(s.users),
      sub: L(`${n(s.newUsers24h)} جدید در ۲۴ ساعت`, `${n(s.newUsers24h)} new in 24h`),
    },
    {
      icon: "globe",
      k: L("آنلاین الان", "Online now"),
      v: n(s.online),
      sub: L(`${n(s.active24h)} فعال در ۲۴ ساعت`, `${n(s.active24h)} active in 24h`),
    },
    {
      icon: "chat",
      k: L("پیام‌ها", "Messages"),
      v: n(s.messages),
      sub: L(`${n(s.messages24h)} در ۲۴ ساعت`, `${n(s.messages24h)} in 24h`),
    },
    {
      icon: "group",
      k: L("گروه / کانال", "Groups / channels"),
      v: `${n(s.groups)} / ${n(s.channels)}`,
      sub: L(`${n(s.directChats)} گفتگوی خصوصی`, `${n(s.directChats)} private chats`),
    },
    {
      icon: "phone",
      k: L("تماس‌ها", "Calls"),
      v: n(s.activeCalls),
      sub: L(`فعال · ${n(s.calls24h)} در ۲۴ ساعت`, `active · ${n(s.calls24h)} in 24h`),
    },
    {
      icon: "image",
      k: L("رسانه", "Media"),
      v: fileSize(s.mediaBytes, lang),
      sub: L(`${n(s.mediaFiles)} فایل`, `${n(s.mediaFiles)} files`),
    },
    {
      icon: "database",
      k: L("پایگاه داده", "Database"),
      v: fileSize(s.dbBytes, lang),
      sub: "SQLite (WAL)",
    },
    {
      icon: "ad",
      k: L("تبلیغات", "Ads"),
      v: n(s.adClicks),
      sub: L(`کلیک از ${n(s.adImpressions)} نمایش`, `clicks of ${n(s.adImpressions)} views`),
    },
  ];
  return (
    <>
      <h1>{L("داشبورد", "Dashboard")}</h1>
      <p className="lead">
        {L(
          "وضعیت لحظه‌ای سرور شما. محتوای پیام‌ها هرگز در پنل مدیریت نمایش داده نمی‌شود.",
          "Live status of your server. Message contents are never shown in the admin panel.",
        )}
      </p>
      <AdminAd />
      <div className="stat-grid">
        {tiles.map((t) => (
          <div className="stat" key={t.k}>
            <div className="k">
              <Icon name={t.icon} size={15} />
              {t.k}
            </div>
            <div className="v">{t.v}</div>
            <div className="s">{t.sub}</div>
          </div>
        ))}
      </div>
      <Bars
        label={L("پیام‌ها در ۱۴ روز اخیر", "Messages, last 14 days")}
        data={s.series.map((d) => ({ day: d.day, value: d.messages }))}
      />
      <Bars
        label={L("ثبت‌نام‌ها در ۱۴ روز اخیر", "Sign-ups, last 14 days")}
        data={s.series.map((d) => ({ day: d.day, value: d.signups }))}
      />
    </>
  );
}

interface SystemInfo {
  version: string;
  goVersion: string;
  os: string;
  uptimeSec: number;
  memoryMB: number;
  goroutines: number;
  dataDir: string;
  listen: string;
  tls: string;
  turn: { running: boolean; port: number; error: string };
  relayIP: string;
  localIP: string;
}

export function SystemPage() {
  const L = useL();
  const lang = useApp((s) => s.lang);
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    get<SystemInfo>("/api/admin/system")
      .then(setInfo)
      .catch(() => {});
  }, []);

  const backup = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/backup", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const name =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ||
        "neochat-backup.db";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch {
      useApp.getState().toast(L("ساخت پشتیبان ناموفق بود", "Backup failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const up = info
    ? `${Math.floor(info.uptimeSec / 86400)}d ${Math.floor((info.uptimeSec % 86400) / 3600)}h ${Math.floor((info.uptimeSec % 3600) / 60)}m`
    : "";
  return (
    <>
      <h1>{L("سیستم و پشتیبان", "System & backup")}</h1>
      <p className="lead">
        {L(
          "همه‌چیز در یک فایل اجرایی: وب‌سرور، پایگاه داده، رله تماس و اپ.",
          "Everything in one binary: web server, database, call relay and the app.",
        )}
      </p>
      {info && (
        <div className="settings-section">
          <h2>
            <Icon name="server" size={18} />
            {L("اطلاعات سرور", "Server")}
          </h2>
          <dl className="kv" style={{ margin: "12px 0 16px" }}>
            <dt>{L("نسخه", "Version")}</dt>
            <dd>
              {info.version} · {info.os} · {info.goVersion}
            </dd>
            <dt>{L("زمان کارکرد", "Uptime")}</dt>
            <dd className="ltr">{up}</dd>
            <dt>{L("حافظه", "Memory")}</dt>
            <dd>
              {num(info.memoryMB, lang)} MB · {num(info.goroutines, lang)} goroutines
            </dd>
            <dt>{L("آدرس شنود", "Listen")}</dt>
            <dd>
              <span className="code">{info.listen}</span> · TLS: {info.tls}
            </dd>
            <dt>{L("آی‌پی محلی", "Local IP")}</dt>
            <dd>
              <span className="code">{info.localIP}</span>
            </dd>
            <dt>{L("پوشه داده", "Data directory")}</dt>
            <dd>
              <span className="code">{info.dataDir}</span>
            </dd>
            <dt>TURN</dt>
            <dd>
              {info.turn.running ? (
                <span className="chip success">
                  {L("فعال", "running")} · UDP/TCP {info.turn.port} · relay {info.relayIP}
                </span>
              ) : (
                <span className="chip danger">
                  {L("غیرفعال", "stopped")}
                  {info.turn.error ? ` · ${info.turn.error}` : ""}
                </span>
              )}
            </dd>
          </dl>
        </div>
      )}
      <div className="settings-section">
        <h2>
          <Icon name="database" size={18} />
          {L("پشتیبان‌گیری", "Backup")}
        </h2>
        <p>
          {L(
            "یک نسخه سازگار از پایگاه داده (کاربران، گفتگوها، پیام‌ها، تنظیمات) دانلود می‌شود. فایل‌های رسانه در پوشه media داخل پوشه داده هستند؛ آن‌ها را جداگانه کپی کنید.",
            "Downloads a consistent snapshot of the database (users, chats, messages, settings). Media files live in the media folder inside the data directory — copy that folder separately.",
          )}
        </p>
        <div style={{ paddingBottom: 14 }}>
          <button className="btn btn-primary" onClick={backup} disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name="download" size={18} />}
            {L("دانلود پشتیبان پایگاه داده", "Download database backup")}
          </button>
        </div>
        <p>
          {L(
            "بازیابی: سرویس را متوقف کنید، فایل پشتیبان را با نام neochat.db در پوشه داده قرار دهید و دوباره اجرا کنید.",
            "Restore: stop the service, place the backup as neochat.db in the data directory, and start it again.",
          )}
        </p>
      </div>
      <div className="settings-section">
        <h2>
          <Icon name="lock" size={18} />
          {L("دستورات خط فرمان", "Command line")}
        </h2>
        <p>
          {L(
            "بازیابی رمز مدیر یا دادن دسترسی مدیر از روی سرور:",
            "Recover an admin password or grant admin rights on the server:",
          )}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 16 }}>
          <span className="code">neochat reset-password admin NEW-PASSWORD</span>
          <span className="code">neochat make-admin USERNAME</span>
        </div>
      </div>
    </>
  );
}
