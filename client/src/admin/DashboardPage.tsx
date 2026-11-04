import { useEffect, useState } from "react";
import { adHref, adsFor, adTarget } from "../ads";
import { get, getToken, post } from "../api";
import { Icon } from "../components/Icon";
import { fileSize, num } from "../format";
import { Avatar } from "../components/ui";
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
  diskFree?: number;
  diskLow?: boolean;
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
      {s.diskLow && (
        <div className="disk-alert" role="alert">
          <Icon name="alert" size={18} />
          {L(
            `فضای خالی دیسک فقط ${fileSize(s.diskFree || 0, lang)} است. آپلود فایل متوقف شده ولی پیام و تماس کار می‌کنند. فایل‌های قدیمی را پاک کنید یا قانون نگه‌داری را سخت‌تر کنید.`,
            `Only ${fileSize(s.diskFree || 0, lang)} of disk is free. File uploads are paused; messages and calls still work. Clean up old files or tighten the retention rules.`,
          )}
        </div>
      )}
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
      <StorageCard />
    </>
  );
}

interface StorageInfo {
  diskTotal?: number;
  diskFree?: number;
  diskLow?: boolean;
  minFreeMB: number;
  mediaBytes: number;
  byKind: { kind: string; files: number; bytes: number }[];
  topUsers: {
    id: number;
    username: string;
    displayName: string;
    avatar: string;
    files: number;
    bytes: number;
    quotaMB: number;
  }[];
  growth: { day: string; bytes: number }[];
  daysLeft: number;
  expiringFiles: number;
  expiringBytes: number;
  userQuotaMB: number;
}

const kindName = (k: string, L: (fa: string, en: string) => string) =>
  ({
    image: L("عکس", "Photos"),
    video: L("ویدیو", "Videos"),
    file: L("فایل", "Files"),
    voice: L("پیام صوتی", "Voice notes"),
    audio: L("صدا", "Audio"),
  })[k] || k;

/** Disk, what fills it, who fills it, how fast, and a button to apply the rules right now. */
function StorageCard() {
  const L = useL();
  const lang = useApp((s) => s.lang);
  const [d, setD] = useState<StorageInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () =>
    get<StorageInfo>("/api/admin/storage")
      .then(setD)
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);
  if (!d) return null;
  const n = (v: number) => num(v, lang);
  const used = d.diskTotal && d.diskFree !== undefined ? d.diskTotal - d.diskFree : 0;
  const cleanup = async () => {
    setBusy(true);
    try {
      const r = await post<{ files: number; bytes: number }>("/api/admin/storage/cleanup");
      useApp
        .getState()
        .toast(
          L(
            `${n(r.files)} فایل و ${fileSize(r.bytes, lang)} پاک شد`,
            `Removed ${n(r.files)} files (${fileSize(r.bytes, lang)})`,
          ),
        );
      load();
    } finally {
      setBusy(false);
    }
  };
  const maxKind = Math.max(1, ...d.byKind.map((k) => k.bytes));
  return (
    <div className="chart-card storage-card">
      <div className="sc-head">
        <h3>{L("فضای سرور", "Server storage")}</h3>
        <button className="btn btn-sm" onClick={cleanup} disabled={busy}>
          {busy ? <span className="spinner" /> : <Icon name="trash" size={15} />}
          {L("همین الان پاک‌سازی کن", "Clean up now")}
        </button>
      </div>
      {d.diskTotal ? (
        <>
          <div className={`sc-disk${d.diskLow ? " low" : ""}`}>
            <i style={{ width: `${(used / d.diskTotal) * 100}%` }} />
            <b
              style={{ insetInlineEnd: `${((d.minFreeMB * 1048576) / d.diskTotal) * 100}%` }}
              title={L("حد امن", "Safe minimum")}
            />
          </div>
          <div className="sc-line">
            {L(
              `${fileSize(d.diskFree || 0, lang)} خالی از ${fileSize(d.diskTotal, lang)} · رسانه‌ها ${fileSize(d.mediaBytes, lang)}`,
              `${fileSize(d.diskFree || 0, lang)} free of ${fileSize(d.diskTotal, lang)} · media ${fileSize(d.mediaBytes, lang)}`,
            )}
            {d.daysLeft >= 0 && (
              <b>
                {" · "}
                {L(
                  `با این سرعت دیسک حدود ${n(d.daysLeft)} روز دیگر پر می‌شود`,
                  `at this pace the disk is full in about ${n(d.daysLeft)} days`,
                )}
              </b>
            )}
          </div>
        </>
      ) : null}
      {d.expiringFiles > 0 && (
        <div className="sc-line muted">
          {L(
            `${n(d.expiringFiles)} فایل (${fileSize(d.expiringBytes, lang)}) در ۷ روز آینده منقضی می‌شود`,
            `${n(d.expiringFiles)} files (${fileSize(d.expiringBytes, lang)}) expire in the next 7 days`,
          )}
        </div>
      )}
      <div className="sc-cols">
        <div>
          <h4>{L("بر اساس نوع", "By type")}</h4>
          {d.byKind.map((k) => (
            <div className="sc-row" key={k.kind}>
              <span className="grow">{kindName(k.kind, L)}</span>
              <span className="muted">{n(k.files)}</span>
              <span className="sc-meter">
                <i style={{ width: `${(k.bytes / maxKind) * 100}%` }} />
              </span>
              <b>{fileSize(k.bytes, lang)}</b>
            </div>
          ))}
        </div>
        <div>
          <h4>{L("پرمصرف‌ترین کاربران", "Top users")}</h4>
          {d.topUsers.map((u) => {
            const q = u.quotaMB < 0 ? d.userQuotaMB : u.quotaMB;
            return (
              <div className="sc-row" key={u.id}>
                <Avatar id={u.id} name={u.displayName} media={u.avatar} size={26} />
                <span className="grow">
                  {u.displayName} <span className="muted ltr">@{u.username}</span>
                </span>
                <b>{fileSize(u.bytes, lang)}</b>
                {q > 0 && <span className="muted">/ {fileSize(q * 1048576, lang)}</span>}
              </div>
            );
          })}
        </div>
      </div>
      <Bars
        label={L("حجم آپلود در ۳۰ روز اخیر (مگابایت)", "Uploads, last 30 days (MB)")}
        data={d.growth.map((g) => ({ day: g.day, value: Math.round(g.bytes / 1048576) }))}
      />
    </div>
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
