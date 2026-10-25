import { useCallback, useEffect, useState } from "react";
import { del, get, patch, post } from "../api";
import { Icon } from "../components/Icon";
import { Avatar, Modal, SearchField, useDebounced } from "../components/ui";
import { listStamp, num, presenceText } from "../format";
import { errorText } from "../i18n";
import { useApp } from "../store";
import type { User } from "../types";
import { useL } from "./l10n";

type AdminUser = User & { messages: number };

export function UsersPage() {
  const L = useL();
  const lang = useApp((s) => s.lang);
  const meId = useApp((s) => s.me?.id);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ users: AdminUser[]; total: number; perPage: number } | null>(
    null,
  );
  const [pwUser, setPwUser] = useState<AdminUser | null>(null);
  const debounced = useDebounced(q, 250);

  const load = useCallback(() => {
    get<{ users: AdminUser[]; total: number; perPage: number }>(
      `/api/admin/users?q=${encodeURIComponent(debounced)}&page=${page}&filter=${filter}`,
    )
      .then(setData)
      .catch(() => {});
  }, [debounced, page, filter]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [debounced, filter]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      load();
    } catch (e) {
      useApp.getState().toast(errorText(lang, e), "error");
    }
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;
  return (
    <>
      <h1>{L("کاربران", "Users")}</h1>
      <p className="lead">
        {L(
          "حساب‌ها فقط نام کاربری دارند؛ هیچ شماره تلفن یا ایمیلی ذخیره نمی‌شود.",
          "Accounts only have a username — no phone number or email is ever stored.",
        )}
      </p>
      <div className="toolbar">
        <SearchField
          value={q}
          onChange={setQ}
          placeholder={L("جستجوی نام یا @نام‌کاربری", "Search name or @username")}
        />
        <div className="segmented">
          {[
            ["", L("همه", "All")],
            ["online", L("آنلاین", "Online")],
            ["admins", L("مدیران", "Admins")],
            ["banned", L("مسدود", "Banned")],
          ].map(([id, label]) => (
            <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>{L("کاربر", "User")}</th>
              <th>{L("وضعیت", "Status")}</th>
              <th>{L("پیام‌ها", "Messages")}</th>
              <th>{L("عضویت", "Joined")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="user">
                    <Avatar
                      id={u.id}
                      name={u.displayName}
                      media={u.avatar}
                      size={36}
                      online={u.online}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>
                        {u.displayName}{" "}
                        {u.isAdmin && <span className="chip accent">{L("مدیر", "admin")}</span>}{" "}
                        {u.banned && <span className="chip danger">{L("مسدود", "banned")}</span>}
                      </div>
                      <div
                        className="ltr"
                        style={{ fontSize: 12.5, color: "var(--text-2)", textAlign: "start" }}
                      >
                        @{u.username}
                      </div>
                    </div>
                  </div>
                </td>
                <td style={{ fontSize: 13, color: "var(--text-2)", whiteSpace: "nowrap" }}>
                  {presenceText({ ...u, lastSeenHidden: false }, lang)}
                </td>
                <td>{num(u.messages, lang)}</td>
                <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>
                  {listStamp(u.createdAt, lang)}
                </td>
                <td>
                  <div className="actions">
                    <button
                      className="btn btn-sm"
                      onClick={() => setPwUser(u)}
                      title={L("تغییر رمز", "Reset password")}
                    >
                      <Icon name="lock" size={15} />
                    </button>
                    {u.id !== meId && (
                      <>
                        <button
                          className="btn btn-sm"
                          onClick={() =>
                            act(() => patch(`/api/admin/users/${u.id}`, { isAdmin: !u.isAdmin }))
                          }
                        >
                          {u.isAdmin ? L("حذف مدیر", "Revoke admin") : L("مدیر کن", "Make admin")}
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() =>
                            act(() => patch(`/api/admin/users/${u.id}`, { banned: !u.banned }))
                          }
                        >
                          {u.banned ? L("رفع مسدودی", "Unban") : L("مسدود", "Ban")}
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          title={L("حذف حساب", "Delete account")}
                          onClick={() =>
                            confirm(L(`حساب @${u.username} حذف شود؟`, `Delete @${u.username}?`)) &&
                            act(() => del(`/api/admin/users/${u.id}`))
                          }
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="toolbar" style={{ justifyContent: "center", marginTop: 14 }}>
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <Icon name="back" size={16} className="flip-rtl" />
          </button>
          <span style={{ fontSize: 14 }}>
            {num(page, lang)} / {num(pages, lang)}
          </span>
          <button className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            <Icon name="forward" size={16} className="flip-rtl" />
          </button>
        </div>
      )}
      {pwUser && <ResetPasswordModal user={pwUser} onClose={() => setPwUser(null)} />}
    </>
  );
}

function ResetPasswordModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const L = useL();
  const lang = useApp((s) => s.lang);
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const save = async () => {
    try {
      await patch(`/api/admin/users/${user.id}`, { password: pw });
      useApp
        .getState()
        .toast(
          L(
            "رمز تغییر کرد و همه نشست‌های کاربر بسته شد",
            "Password changed and all sessions signed out",
          ),
        );
      onClose();
    } catch (e) {
      setError(errorText(lang, e));
    }
  };
  return (
    <Modal
      title={L(`رمز جدید برای @${user.username}`, `New password for @${user.username}`)}
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={save} disabled={pw.length < 6}>
          {L("ذخیره", "Save")}
        </button>
      }
    >
      {error && <div className="form-error">{error}</div>}
      <div className="field">
        <label>{L("رمز جدید", "New password")}</label>
        <input
          className="input ltr"
          dir="ltr"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="new-password"
        />
      </div>
    </Modal>
  );
}

interface AdminRoom {
  id: number;
  type: "group" | "channel";
  title: string;
  handle: string;
  avatar: string;
  createdAt: number;
  lastMessageAt: number;
  memberCount: number;
  messageCount: number;
  owner: string;
}

export function RoomsPage() {
  const L = useL();
  const lang = useApp((s) => s.lang);
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 250);
  const [rooms, setRooms] = useState<AdminRoom[] | null>(null);
  const load = useCallback(() => {
    get<AdminRoom[]>(`/api/admin/rooms?q=${encodeURIComponent(debounced)}`)
      .then(setRooms)
      .catch(() => {});
  }, [debounced]);
  useEffect(load, [load]);
  return (
    <>
      <h1>{L("گروه‌ها و کانال‌ها", "Groups & channels")}</h1>
      <p className="lead">
        {L(
          "فقط اطلاعات عمومی روم‌ها نمایش داده می‌شود. می‌توانید روم‌های متخلف را حذف کنید.",
          "Only public room metadata is shown. You can remove rooms that violate your rules.",
        )}
      </p>
      <div className="toolbar">
        <SearchField
          value={q}
          onChange={setQ}
          placeholder={L("جستجوی نام یا لینک", "Search title or link")}
        />
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>{L("روم", "Room")}</th>
              <th>{L("نوع", "Type")}</th>
              <th>{L("اعضا", "Members")}</th>
              <th>{L("پیام‌ها", "Messages")}</th>
              <th>{L("سازنده", "Owner")}</th>
              <th>{L("آخرین فعالیت", "Last activity")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rooms?.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="user">
                    <Avatar id={r.id} name={r.title} media={r.avatar} size={36} squircle />
                    <div>
                      <div style={{ fontWeight: 600 }}>{r.title}</div>
                      <div
                        className="ltr"
                        style={{ fontSize: 12.5, color: "var(--text-2)", textAlign: "start" }}
                      >
                        {r.handle ? "@" + r.handle : L("خصوصی", "private")}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="chip">
                    {r.type === "channel" ? L("کانال", "Channel") : L("گروه", "Group")}
                  </span>
                </td>
                <td>{num(r.memberCount, lang)}</td>
                <td>{num(r.messageCount, lang)}</td>
                <td className="ltr" style={{ textAlign: "start" }}>
                  @{r.owner}
                </td>
                <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                  {listStamp(r.lastMessageAt, lang)}
                </td>
                <td>
                  <div className="actions">
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() =>
                        confirm(
                          L(`«${r.title}» برای همه حذف شود؟`, `Delete “${r.title}” for everyone?`),
                        ) &&
                        del(`/api/admin/rooms/${r.id}`)
                          .then(load)
                          .catch(() => {})
                      }
                    >
                      <Icon name="trash" size={15} />
                      {L("حذف", "Delete")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rooms?.length === 0 && <div className="empty">{L("رومی وجود ندارد", "No rooms yet")}</div>}
      </div>
    </>
  );
}

interface Invite {
  code: string;
  note: string;
  uses: number;
  maxUses: number;
  expiresAt: number;
  createdAt: number;
}

export function InvitesPage() {
  const L = useL();
  const lang = useApp((s) => s.lang);
  const registration = useApp((s) => s.config?.registration);
  const [list, setList] = useState<Invite[]>([]);
  const [form, setForm] = useState({ note: "", maxUses: 1, expiresInDays: 7 });
  const load = () =>
    get<Invite[]>("/api/admin/invites")
      .then(setList)
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);
  const create = async () => {
    try {
      const r = await post<{ code: string }>("/api/admin/invites", form);
      navigator.clipboard?.writeText(r.code);
      useApp
        .getState()
        .toast(L(`کد ${r.code} ساخته و کپی شد`, `Code ${r.code} created and copied`));
      load();
    } catch (e) {
      useApp.getState().toast(errorText(lang, e), "error");
    }
  };
  return (
    <>
      <h1>{L("کدهای دعوت", "Invite codes")}</h1>
      <p className="lead">
        {L(
          "وقتی حالت ثبت‌نام «فقط با دعوت» باشد، کاربران جدید با این کدها حساب می‌سازند.",
          "When registration is “invite only”, new users sign up with these codes.",
        )}{" "}
        {registration !== "invite" && (
          <span className="chip">
            {L("حالت فعلی ثبت‌نام: ", "Current mode: ")}
            {registration}
          </span>
        )}
      </p>
      <div className="settings-section">
        <div className="form-grid">
          <div className="field">
            <label>{L("یادداشت", "Note")}</label>
            <input
              className="input"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder={L("مثلاً تیم فروش", "e.g. sales team")}
            />
          </div>
          <div className="field">
            <label>{L("حداکثر استفاده (۰ = نامحدود)", "Max uses (0 = unlimited)")}</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.maxUses}
              onChange={(e) => setForm({ ...form, maxUses: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>{L("اعتبار (روز، ۰ = همیشه)", "Valid for (days, 0 = forever)")}</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.expiresInDays}
              onChange={(e) => setForm({ ...form, expiresInDays: Number(e.target.value) })}
            />
          </div>
        </div>
        <div style={{ paddingBottom: 14 }}>
          <button className="btn btn-primary" onClick={create}>
            <Icon name="plus" size={18} />
            {L("ساخت کد دعوت", "Create invite code")}
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>{L("کد", "Code")}</th>
              <th>{L("یادداشت", "Note")}</th>
              <th>{L("استفاده", "Uses")}</th>
              <th>{L("انقضا", "Expires")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.code}>
                <td>
                  <button className="code" onClick={() => navigator.clipboard?.writeText(i.code)}>
                    {i.code}
                  </button>
                </td>
                <td>{i.note}</td>
                <td>
                  {num(i.uses, lang)} / {i.maxUses ? num(i.maxUses, lang) : "∞"}
                </td>
                <td style={{ fontSize: 13 }}>
                  {i.expiresAt ? (
                    i.expiresAt < Date.now() ? (
                      <span className="chip danger">{L("منقضی", "expired")}</span>
                    ) : (
                      listStamp(i.expiresAt, lang)
                    )
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <div className="actions">
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => del(`/api/admin/invites/${i.code}`).then(load)}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
