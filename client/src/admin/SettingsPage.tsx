import { useEffect, useState, type ReactNode } from "react";
import { get, mediaUrl, put, upload } from "../api";
import { Icon } from "../components/Icon";
import { Toggle, pickFile } from "../components/ui";
import { errorText } from "../i18n";
import { useApp } from "../store";
import type { PublicConfig } from "../types";
import { useL } from "./l10n";

interface Settings {
  appName: string;
  tagline: string;
  logoMedia: string;
  backgroundMedia: string;
  accentColor: string;
  defaultLang: "fa" | "en";
  defaultTheme: "dark" | "light" | "auto";
  welcomeText: string;
  registration: "open" | "invite" | "closed";
  minPasswordLen: number;
  allowUserRooms: boolean;
  messagesPerMinute: number;
  sessionDays: number;
  maxImageMB: number;
  maxVideoMB: number;
  maxFileMB: number;
  maxMessageLen: number;
  maxGroupMembers: number;
  mediaRetentionDays: number;
  messageRetentionDays: number;
  clientCacheMessages: number;
  mediaCacheDays: number;
  callsEnabled: boolean;
  videoCallsEnabled: boolean;
  turnEnabled: boolean;
  turnPublicIP: string;
  turnPort: number;
  extraIceServers: string[] | null;
  callRingSeconds: number;
  adsEnabled: boolean;
  adsChannelEvery: number;
}

const ACCENTS = [
  "#0a84ff",
  "#30d158",
  "#ff9f0a",
  "#ff375f",
  "#bf5af2",
  "#64d2ff",
  "#ac8e68",
  "#5e5ce6",
];

// Defined at module scope so inputs inside keep focus across re-renders.
function Section({
  icon,
  title,
  desc,
  children,
}: {
  icon: string;
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <div className="settings-section">
      <h2>
        <Icon name={icon} size={18} />
        {title}
      </h2>
      {desc && <p>{desc}</p>}
      {children}
    </div>
  );
}

export function SettingsPage({ section }: { section: "branding" | "access" | "limits" | "calls" }) {
  const L = useL();
  const lang = useApp((s) => s.lang);
  const [orig, setOrig] = useState<Settings | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get<Settings>("/api/admin/settings").then((v) => {
      setOrig(v);
      setS(v);
    });
  }, []);
  if (!s || !orig) return <span className="spinner" />;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const dirty = JSON.stringify(s) !== JSON.stringify(orig);

  const save = async () => {
    setBusy(true);
    try {
      const v = await put<Settings>("/api/admin/settings", s);
      setOrig(v);
      setS(v);
      const cfg = await get<PublicConfig>("/api/config");
      useApp.getState().setConfig(cfg);
      useApp.getState().toast(L("تنظیمات ذخیره شد", "Settings saved"));
    } catch (e) {
      useApp.getState().toast(errorText(lang, e), "error");
    } finally {
      setBusy(false);
    }
  };

  const num = (k: keyof Settings, label: string, hint?: string, min = 0) => (
    <div className="field">
      <label>{label}</label>
      <input
        className="input"
        type="number"
        min={min}
        value={s[k] as number}
        onChange={(e) => set(k, Number(e.target.value) as never)}
      />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
  const sw = (k: keyof Settings, label: string, hint?: string) => (
    <div className="switch-row">
      <div className="grow">
        <div>{label}</div>
        {hint && <div className="muted">{hint}</div>}
      </div>
      <Toggle checked={!!s[k]} onChange={(v) => set(k, v as never)} label={label} />
    </div>
  );

  const image = (k: "logoMedia" | "backgroundMedia", label: string, wide?: boolean) => (
    <div className="field">
      <label>{label}</label>
      <div className="image-pick">
        <div
          className={`preview${wide ? " wide" : ""}`}
          style={{
            backgroundImage: s[k]
              ? `url(${mediaUrl(s[k], true)})`
              : k === "logoMedia"
                ? "url(/icon.svg)"
                : undefined,
          }}
        />
        <button
          className="btn btn-sm"
          onClick={async () => {
            const f = await pickFile("image/png,image/jpeg,image/webp,image/gif");
            if (!f) return;
            try {
              set(k, (await upload(f)).id);
            } catch (e) {
              useApp.getState().toast(errorText(lang, e), "error");
            }
          }}
        >
          <Icon name="image" size={16} />
          {L("انتخاب تصویر", "Choose image")}
        </button>
        {s[k] && (
          <button className="btn btn-sm btn-ghost" onClick={() => set(k, "")}>
            {L("پیش‌فرض", "Default")}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {section === "branding" && (
        <>
          <h1>{L("برندینگ", "Branding")}</h1>
          <p className="lead">
            {L(
              "نام، لوگو، رنگ و پس‌زمینه پیام‌رسان شما. تغییرات فوراً برای همه کاربران اعمال می‌شود.",
              "Your messenger’s name, logo, color and backdrop. Changes apply to every user instantly.",
            )}
          </p>
          <Section icon="palette" title={L("هویت", "Identity")}>
            <div className="form-grid">
              <div className="field">
                <label>{L("نام پیام‌رسان", "Messenger name")}</label>
                <input
                  className="input"
                  value={s.appName}
                  onChange={(e) => set("appName", e.target.value)}
                  maxLength={40}
                />
              </div>
              <div className="field">
                <label>{L("شعار", "Tagline")}</label>
                <input
                  className="input"
                  value={s.tagline}
                  onChange={(e) => set("tagline", e.target.value)}
                  maxLength={120}
                />
              </div>
            </div>
            <div className="field">
              <label>{L("متن خوشامد (صفحه اصلی)", "Welcome text (home screen)")}</label>
              <textarea
                className="textarea"
                value={s.welcomeText}
                onChange={(e) => set("welcomeText", e.target.value)}
                maxLength={500}
              />
            </div>
            <div className="form-grid">
              {image("logoMedia", L("لوگو / آیکون اپ", "Logo / app icon"))}
              {image("backgroundMedia", L("تصویر پس‌زمینه", "Background image"), true)}
            </div>
          </Section>
          <Section icon="moon" title={L("ظاهر پیش‌فرض", "Default look")}>
            <div className="field">
              <label>{L("رنگ اصلی", "Accent color")}</label>
              <div className="color-swatches">
                {ACCENTS.map((c) => (
                  <button
                    key={c}
                    style={{ background: c }}
                    aria-pressed={s.accentColor.toLowerCase() === c}
                    onClick={() => set("accentColor", c)}
                    aria-label={c}
                  />
                ))}
                <input
                  type="color"
                  value={s.accentColor}
                  onChange={(e) => set("accentColor", e.target.value)}
                  aria-label="custom"
                />
                <span className="code">{s.accentColor}</span>
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>{L("زبان پیش‌فرض", "Default language")}</label>
                <select
                  className="select"
                  value={s.defaultLang}
                  onChange={(e) => set("defaultLang", e.target.value as "fa")}
                >
                  <option value="fa">فارسی</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div className="field">
                <label>{L("پوسته پیش‌فرض", "Default theme")}</label>
                <select
                  className="select"
                  value={s.defaultTheme}
                  onChange={(e) => set("defaultTheme", e.target.value as "dark")}
                >
                  <option value="dark">{L("تیره", "Dark")}</option>
                  <option value="light">{L("روشن", "Light")}</option>
                  <option value="auto">{L("مطابق سیستم", "System")}</option>
                </select>
              </div>
            </div>
          </Section>
        </>
      )}

      {section === "access" && (
        <>
          <h1>{L("ثبت‌نام و امنیت", "Registration & security")}</h1>
          <p className="lead">
            {L(
              "حساب‌ها بدون شماره تلفن ساخته می‌شوند. تعیین کنید چه کسی می‌تواند عضو شود.",
              "Accounts are created without phone numbers. Decide who may join.",
            )}
          </p>
          <Section icon="users" title={L("ثبت‌نام", "Registration")}>
            <div className="segmented" style={{ marginBottom: 12 }}>
              {(
                [
                  ["open", L("آزاد", "Open")],
                  ["invite", L("فقط با دعوت", "Invite only")],
                  ["closed", L("بسته", "Closed")],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  aria-pressed={s.registration === v}
                  onClick={() => set("registration", v)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 13, color: "var(--text-2)", margin: "0 4px 14px" }}>
              {s.registration === "open"
                ? L(
                    "هر کسی که به سرور دسترسی دارد می‌تواند حساب بسازد.",
                    "Anyone who can reach the server can create an account.",
                  )
                : s.registration === "invite"
                  ? L(
                      "فقط افرادی که کد دعوت دارند. کدها را در بخش «کدهای دعوت» بسازید.",
                      "Only people with an invite code. Create codes in “Invite codes”.",
                    )
                  : L(
                      "فقط مدیر می‌تواند حساب بسازد (از طریق کدهای دعوت با تغییر موقت حالت).",
                      "Nobody can sign up on their own.",
                    )}
            </p>
            {sw(
              "allowUserRooms",
              L("کاربران بتوانند گروه و کانال بسازند", "Users can create groups and channels"),
              L("در غیر این صورت فقط مدیران سرور.", "Otherwise only server admins can."),
            )}
          </Section>
          <Section icon="shield" title={L("امنیت", "Security")}>
            <div className="form-grid">
              {num(
                "minPasswordLen",
                L("حداقل طول رمز عبور", "Minimum password length"),
                undefined,
                6,
              )}
              {num(
                "messagesPerMinute",
                L("حداکثر پیام در دقیقه برای هر کاربر", "Max messages per minute per user"),
                L("ضد اسپم؛ ۰ = نامحدود", "Anti-spam; 0 = unlimited"),
              )}
              {num(
                "sessionDays",
                L("انقضای نشست بدون فعالیت (روز)", "Idle session expiry (days)"),
                undefined,
                1,
              )}
            </div>
          </Section>
        </>
      )}

      {section === "limits" && (
        <>
          <h1>{L("محدودیت‌ها و ذخیره‌سازی", "Limits & storage")}</h1>
          <p className="lead">
            {L(
              "حجم مجاز فایل‌ها، نگهداری داده و کش روی دستگاه کاربران.",
              "Allowed file sizes, data retention and caching on users’ devices.",
            )}
          </p>
          <Section
            icon="image"
            title={L("حجم مجاز آپلود", "Upload limits")}
            desc={L(
              "فایل‌های بزرگ‌تر هم در سرور و هم در اپ رد می‌شوند.",
              "Larger files are rejected both in the app and on the server.",
            )}
          >
            <div className="form-grid">
              {num(
                "maxImageMB",
                L("حداکثر حجم عکس (مگابایت)", "Max photo size (MB)"),
                undefined,
                1,
              )}
              {num(
                "maxVideoMB",
                L("حداکثر حجم ویدیو (مگابایت)", "Max video size (MB)"),
                undefined,
                1,
              )}
              {num(
                "maxFileMB",
                L("حداکثر حجم فایل و صوت (مگابایت)", "Max file / audio size (MB)"),
                undefined,
                1,
              )}
            </div>
          </Section>
          <Section icon="chat" title={L("پیام و روم", "Messages & rooms")}>
            <div className="form-grid">
              {num(
                "maxMessageLen",
                L("حداکثر طول پیام (کاراکتر)", "Max message length (characters)"),
                undefined,
                100,
              )}
              {num(
                "maxGroupMembers",
                L("حداکثر اعضای هر گروه/کانال", "Max members per group/channel"),
                undefined,
                2,
              )}
            </div>
          </Section>
          <Section
            icon="database"
            title={L("نگهداری داده", "Retention")}
            desc={L(
              "۰ یعنی برای همیشه نگه داشته شود. پاکسازی هر ساعت انجام می‌شود.",
              "0 keeps data forever. Cleanup runs hourly.",
            )}
          >
            <div className="form-grid">
              {num(
                "messageRetentionDays",
                L("حذف پیام‌های قدیمی‌تر از (روز)", "Delete messages older than (days)"),
              )}
              {num(
                "mediaRetentionDays",
                L("حذف رسانه‌های قدیمی‌تر از (روز)", "Delete media older than (days)"),
              )}
            </div>
          </Section>
          <Section
            icon="download"
            title={L("کش و ذخیره آفلاین", "Caching & offline")}
            desc={L(
              "اپ آخرین پیام‌ها را روی دستگاه نگه می‌دارد تا بدون اینترنت هم قابل خواندن باشند؛ رسانه‌ها هم کش می‌شوند.",
              "The app keeps recent messages on the device so they stay readable offline; media is cached too.",
            )}
          >
            <div className="form-grid">
              {num(
                "clientCacheMessages",
                L("تعداد پیام کش‌شده در هر گفتگو", "Cached messages per chat"),
                L("۰ = بدون کش", "0 = no cache"),
              )}
              {num("mediaCacheDays", L("نگهداری کش رسانه (روز)", "Media cache lifetime (days)"))}
            </div>
          </Section>
        </>
      )}

      {section === "calls" && (
        <>
          <h1>{L("تماس و شبکه", "Calls & network")}</h1>
          <p className="lead">
            {L(
              "تماس صوتی و تصویری مستقیم بین کاربران برقرار می‌شود. رله TURN داخلی تضمین می‌کند که حتی پشت NAT و بدون اینترنت بین‌الملل هم تماس وصل شود.",
              "Voice and video calls connect peer-to-peer. The built-in TURN relay makes sure calls connect even behind NAT and without international internet.",
            )}
          </p>
          <Section icon="phone" title={L("تماس‌ها", "Calls")}>
            {sw("callsEnabled", L("فعال بودن تماس صوتی", "Enable voice calls"))}
            {sw("videoCallsEnabled", L("فعال بودن تماس تصویری", "Enable video calls"))}
            <div className="form-grid">
              {num(
                "callRingSeconds",
                L("مدت زنگ خوردن (ثانیه)", "Ring timeout (seconds)"),
                undefined,
                10,
              )}
            </div>
          </Section>
          <Section
            icon="server"
            title={L("رله TURN داخلی", "Built-in TURN relay")}
            desc={L(
              "پورت UDP و TCP را در فایروال باز کنید. تغییرات بدون ری‌استارت اعمال می‌شود.",
              "Open this UDP and TCP port in your firewall. Changes apply without a restart.",
            )}
          >
            {sw("turnEnabled", L("فعال بودن رله", "Enable relay"))}
            <div className="form-grid">
              <div className="field">
                <label>{L("آی‌پی عمومی سرور", "Server public IP")}</label>
                <input
                  className="input ltr"
                  dir="ltr"
                  value={s.turnPublicIP}
                  onChange={(e) => set("turnPublicIP", e.target.value)}
                  placeholder={L("خالی = تشخیص خودکار", "empty = auto-detect")}
                />
                <span className="hint">
                  {L(
                    "آی‌پی‌ای که کاربران سرور را با آن می‌بینند.",
                    "The IP users reach the server at.",
                  )}
                </span>
              </div>
              {num("turnPort", L("پورت رله", "Relay port"), "UDP + TCP", 1)}
            </div>
            <div className="field">
              <label>
                {L("سرورهای STUN/TURN اضافه (هر خط یکی)", "Extra STUN/TURN servers (one per line)")}
              </label>
              <textarea
                className="textarea ltr"
                dir="ltr"
                value={(s.extraIceServers || []).join("\n")}
                onChange={(e) => set("extraIceServers", e.target.value.split("\n"))}
                placeholder="stun:stun.example.com:3478"
              />
            </div>
          </Section>
          <Section icon="ad" title={L("تبلیغات", "Advertising")}>
            {sw("adsEnabled", L("نمایش تبلیغات", "Show ads"))}
            <div className="form-grid">
              {num(
                "adsChannelEvery",
                L(
                  "نمایش پست تبلیغاتی در کانال‌ها هر چند پیام",
                  "Sponsored post in channels every N messages",
                ),
                undefined,
                3,
              )}
            </div>
          </Section>
        </>
      )}

      {dirty && (
        <div className="save-bar glass-float">
          <button className="btn" onClick={() => setS(orig)}>
            {L("انصراف", "Discard")}
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name="check" size={18} />}
            {L("ذخیره تغییرات", "Save changes")}
          </button>
        </div>
      )}
    </>
  );
}
