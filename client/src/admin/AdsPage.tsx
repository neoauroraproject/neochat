import { useEffect, useState } from "react";
import { del, get, mediaUrl, post, put, upload } from "../api";
import { Icon } from "../components/Icon";
import { Modal, Toggle, pickFile } from "../components/ui";
import { num } from "../format";
import { errorText } from "../i18n";
import { useApp } from "../store";
import type { Ad } from "../types";
import { useL } from "./l10n";

const toLocal = (ms: number) =>
  ms ? new Date(ms - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
const fromLocal = (s: string) => (s ? new Date(s).getTime() : 0);

export function AdsPage() {
  const L = useL();
  const lang = useApp((s) => s.lang);
  const adsEnabled = useApp((s) => s.config?.adsEnabled);
  const [ads, setAds] = useState<Ad[]>([]);
  const [editing, setEditing] = useState<Partial<Ad> | null>(null);
  const load = () =>
    get<Ad[]>("/api/admin/ads")
      .then(setAds)
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const toggle = async (a: Ad) => {
    await put(`/api/admin/ads/${a.id}`, { ...a, active: !a.active });
    load();
  };

  const status = (a: Ad) => {
    const now = Date.now();
    if (!a.active) return <span className="chip">{L("متوقف", "Paused")}</span>;
    if (a.startsAt && a.startsAt > now)
      return <span className="chip">{L("زمان‌بندی‌شده", "Scheduled")}</span>;
    if (a.endsAt && a.endsAt < now)
      return <span className="chip danger">{L("پایان‌یافته", "Ended")}</span>;
    return <span className="chip success">{L("در حال نمایش", "Live")}</span>;
  };

  return (
    <>
      <h1>{L("تبلیغات", "Advertising")}</h1>
      <p className="lead">
        {L(
          "بنر بالای لیست گفتگوها و پست تبلیغاتی داخل کانال‌ها. کلیک‌ها از طریق سرور شما شمرده می‌شوند.",
          "A banner above the chat list and sponsored posts inside channels. Clicks are counted through your own server.",
        )}{" "}
        {!adsEnabled && (
          <span className="chip danger">
            {L(
              "نمایش تبلیغات در «تماس و شبکه» خاموش است",
              "Ads are turned off in “Calls & network”",
            )}
          </span>
        )}
      </p>
      <NetworkAds />
      <div className="toolbar">
        <button
          className="btn btn-primary"
          onClick={() =>
            setEditing({
              title: "",
              body: "",
              link: "",
              cta: "",
              image: "",
              placement: "all",
              active: true,
              priority: 0,
              startsAt: 0,
              endsAt: 0,
            })
          }
        >
          <Icon name="plus" size={18} />
          {L("تبلیغ جدید", "New ad")}
        </button>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>{L("تبلیغ", "Ad")}</th>
              <th>{L("محل نمایش", "Placement")}</th>
              <th>{L("وضعیت", "Status")}</th>
              <th>{L("نمایش", "Views")}</th>
              <th>{L("کلیک", "Clicks")}</th>
              <th>CTR</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ads.map((a) => (
              <tr key={a.id}>
                <td>
                  <div className="user">
                    {a.image ? (
                      <img
                        src={mediaUrl(a.image, true)}
                        alt=""
                        style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover" }}
                      />
                    ) : (
                      <span
                        className="item-icon"
                        style={{ background: "var(--accent)", width: 44, height: 44 }}
                      >
                        <Icon name="ad" size={20} />
                      </span>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{a.title}</div>
                      <div
                        className="ltr"
                        style={{
                          fontSize: 12,
                          color: "var(--text-2)",
                          maxWidth: 260,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          textAlign: "start",
                        }}
                      >
                        {a.link}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="chip">
                    {(
                      {
                        chatlist: L("لیست گفتگو", "Chat list"),
                        channel: L("کانال‌ها", "Channels"),
                        chattop: L("بالای چت", "Above chats"),
                        sidebar: L("ستون کناری", "Sidebar"),
                        admin: L("داشبورد مدیر", "Admin dashboard"),
                      } as Record<string, string>
                    )[a.placement] || L("همه", "Everywhere")}
                  </span>
                </td>
                <td>{status(a)}</td>
                <td>{num(a.impressions || 0, lang)}</td>
                <td>{num(a.clicks || 0, lang)}</td>
                <td>
                  {a.impressions ? `${(((a.clicks || 0) / a.impressions) * 100).toFixed(1)}%` : "—"}
                </td>
                <td>
                  <div className="actions">
                    <Toggle checked={a.active} onChange={() => toggle(a)} />
                    <button className="btn btn-sm" onClick={() => setEditing(a)}>
                      <Icon name="edit" size={15} />
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() =>
                        confirm(L("حذف شود؟", "Delete?")) &&
                        del(`/api/admin/ads/${a.id}`).then(load)
                      }
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {ads.length === 0 && <div className="empty">{L("هنوز تبلیغی ندارید", "No ads yet")}</div>}
      </div>
      {editing && (
        <AdEditor
          ad={editing}
          onClose={() => setEditing(null)}
          onSaved={() => (setEditing(null), load())}
        />
      )}
    </>
  );
}

interface NetStatus {
  source: string;
  product: string;
  cachedAds: number;
  fetchedAt: number;
  lastAttempt: number;
  lastError: string;
  pendingClicks: number;
  ads: {
    id: string;
    title: string;
    body: string;
    linkUrl: string;
    badge: string;
    placement: string;
  }[];
}

/** NeoAurora network ads: fetched by the server, kept in its database when the network is unreachable. */
function NetworkAds() {
  const L = useL();
  const lang = useApp((s) => s.lang);
  const [st, setSt] = useState<NetStatus | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    get<NetStatus>("/api/admin/netads")
      .then(setSt)
      .catch(() => {});
  }, []);
  const refresh = async () => {
    setBusy(true);
    try {
      setSt(await post<NetStatus>("/api/admin/netads"));
    } finally {
      setBusy(false);
    }
  };
  if (!st) return null;
  const when = (ms: number) =>
    ms
      ? new Intl.DateTimeFormat(lang === "fa" ? "fa-IR" : "en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(ms)
      : "—";
  const place: Record<string, string> = {
    home: L("لیست گفتگو", "Chat list"),
    footer: L("کانال‌ها", "Channels"),
    sidebar: L("ستون کناری", "Sidebar"),
    chat: L("بالای چت", "Above chats"),
    admin: L("داشبورد مدیر", "Admin dashboard"),
  };
  return (
    <div className="settings-section">
      <h2>
        <Icon name="globe" size={18} />
        {L("شبکه تبلیغات NeoAurora", "NeoAurora ad network")}
        {st.lastError ? (
          <span className="chip danger">
            {L("آفلاین — نسخه ذخیره‌شده نمایش داده می‌شود", "offline — showing saved copy")}
          </span>
        ) : st.fetchedAt ? (
          <span className="chip success">{L("همگام", "in sync")}</span>
        ) : null}
      </h2>
      <p>
        {L(
          "این تبلیغات از سرور NeoAurora دریافت و در پایگاه داده همین سرور ذخیره می‌شوند؛ اگر ارتباط قطع شود همان آخرین نسخه نمایش داده می‌شود. کلیک‌ها هم در صف می‌مانند و بعداً ارسال می‌شوند.",
          "These ads come from NeoAurora and are stored in this server’s database; if the connection drops, the last copy keeps showing. Clicks are queued and sent later.",
        )}
      </p>
      <dl className="kv" style={{ marginBottom: 12 }}>
        <dt>{L("آخرین دریافت موفق", "Last successful sync")}</dt>
        <dd>{when(st.fetchedAt)}</dd>
        <dt>{L("تبلیغات ذخیره‌شده", "Cached ads")}</dt>
        <dd>{num(st.cachedAds, lang)}</dd>
        <dt>{L("کلیک‌های در صف", "Queued clicks")}</dt>
        <dd>{num(st.pendingClicks, lang)}</dd>
        {st.lastError && (
          <>
            <dt>{L("آخرین خطا", "Last error")}</dt>
            <dd>{st.lastError}</dd>
          </>
        )}
      </dl>
      {st.ads.map((a) => (
        <div
          key={a.id}
          className="switch-row"
          style={{ borderTop: "1px solid var(--glass-edge)", margin: 0 }}
        >
          <div className="grow">
            <div style={{ fontWeight: 600 }}>{a.title}</div>
            {a.body && <div className="muted">{a.body}</div>}
          </div>
          <span className="chip">{place[a.placement] || a.placement}</span>
        </div>
      ))}
      <div style={{ padding: "10px 0 14px" }}>
        <button className="btn btn-sm" onClick={refresh} disabled={busy}>
          {busy ? (
            <span className="spinner" style={{ width: 14, height: 14 }} />
          ) : (
            <Icon name="flip" size={15} />
          )}
          {L("همگام‌سازی الان", "Sync now")}
        </button>
      </div>
    </div>
  );
}

function AdEditor({
  ad,
  onClose,
  onSaved,
}: {
  ad: Partial<Ad>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const L = useL();
  const lang = useApp((s) => s.lang);
  const [a, setA] = useState<Partial<Ad>>(ad);
  const [error, setError] = useState("");
  const set = <K extends keyof Ad>(k: K, v: Ad[K]) => setA({ ...a, [k]: v });
  const save = async () => {
    try {
      if (a.id) await put(`/api/admin/ads/${a.id}`, a);
      else await post("/api/admin/ads", a);
      onSaved();
    } catch (e) {
      setError(errorText(lang, e));
    }
  };
  return (
    <Modal
      wide
      title={a.id ? L("ویرایش تبلیغ", "Edit ad") : L("تبلیغ جدید", "New ad")}
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={save} disabled={!a.title}>
          {L("ذخیره", "Save")}
        </button>
      }
    >
      {error && <div className="form-error">{error}</div>}
      <div className="form-grid">
        <div>
          <div className="field">
            <label>{L("عنوان", "Title")}</label>
            <input
              className="input"
              value={a.title}
              onChange={(e) => set("title", e.target.value)}
              maxLength={100}
            />
          </div>
          <div className="field">
            <label>{L("متن", "Text")}</label>
            <textarea
              className="textarea"
              value={a.body}
              onChange={(e) => set("body", e.target.value)}
              maxLength={500}
            />
          </div>
          <div className="field">
            <label>{L("لینک", "Link")}</label>
            <input
              className="input ltr"
              dir="ltr"
              value={a.link}
              onChange={(e) => set("link", e.target.value)}
              placeholder="https://… /join/… /@channel"
            />
          </div>
          <div className="field">
            <label>{L("متن دکمه", "Button text")}</label>
            <input
              className="input"
              value={a.cta}
              onChange={(e) => set("cta", e.target.value)}
              maxLength={30}
              placeholder={L("مشاهده", "Open")}
            />
          </div>
        </div>
        <div>
          <div className="field">
            <label>{L("تصویر", "Image")}</label>
            <div className="image-pick">
              <div
                className="preview wide"
                style={{ backgroundImage: a.image ? `url(${mediaUrl(a.image, true)})` : undefined }}
              />
              <button
                className="btn btn-sm"
                onClick={async () => {
                  const f = await pickFile("image/*");
                  if (f) set("image", (await upload(f)).id);
                }}
              >
                <Icon name="image" size={16} />
                {L("انتخاب", "Choose")}
              </button>
              {a.image && (
                <button className="btn btn-sm btn-ghost" onClick={() => set("image", "")}>
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="field">
            <label>{L("محل نمایش", "Placement")}</label>
            <select
              className="select"
              value={a.placement}
              onChange={(e) => set("placement", e.target.value as Ad["placement"])}
            >
              <option value="all">{L("همه جا", "Everywhere")}</option>
              <option value="chatlist">{L("بالای لیست گفتگوها", "Top of chat list")}</option>
              <option value="channel">{L("داخل کانال‌ها", "Inside channels")}</option>
              <option value="chattop">
                {L("نوار بالای صفحه چت (گاه‌به‌گاه)", "Bar above chats (occasional)")}
              </option>
              <option value="sidebar">{L("ستون کناری دسکتاپ", "Desktop sidebar")}</option>
            </select>
          </div>
          <div className="field">
            <label>{L("اولویت (عدد بزرگ‌تر = اول)", "Priority (higher first)")}</label>
            <input
              className="input"
              type="number"
              value={a.priority}
              onChange={(e) => set("priority", Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>{L("شروع (اختیاری)", "Start (optional)")}</label>
            <input
              className="input ltr"
              dir="ltr"
              type="datetime-local"
              value={toLocal(a.startsAt || 0)}
              onChange={(e) => set("startsAt", fromLocal(e.target.value))}
            />
          </div>
          <div className="field">
            <label>{L("پایان (اختیاری)", "End (optional)")}</label>
            <input
              className="input ltr"
              dir="ltr"
              type="datetime-local"
              value={toLocal(a.endsAt || 0)}
              onChange={(e) => set("endsAt", fromLocal(e.target.value))}
            />
          </div>
          <div className="switch-row">
            <div className="grow">{L("فعال", "Active")}</div>
            <Toggle checked={!!a.active} onChange={(v) => set("active", v)} />
          </div>
        </div>
      </div>
      <div className="section-label">{L("پیش‌نمایش", "Preview")}</div>
      <div className="sponsored" style={{ margin: 0, width: "100%" }}>
        {a.image && <img src={mediaUrl(a.image)} alt="" />}
        <div className="c">
          <div className="tag">{L("تبلیغ", "Sponsored")}</div>
          <div className="t">{a.title || L("عنوان تبلیغ", "Ad title")}</div>
          {a.body && <div className="b">{a.body}</div>}
          {a.link && <span className="btn btn-primary">{a.cta || L("مشاهده", "Open")}</span>}
        </div>
      </div>
    </Modal>
  );
}
