import { useEffect, useState } from "react";
import { create } from "zustand";
import { del, get, mediaUrl } from "../api";
import { Icon } from "../components/Icon";
import { confirmAction } from "../components/sheet";
import { dateOf, fileSize, num } from "../format";
import { errorText, useT } from "../i18n";
import { useApp } from "../store";

export interface StorageFile {
  id: string;
  kind: string;
  name: string;
  size: number;
  hasThumb?: boolean;
  createdAt: number;
  expiresAt?: number;
  chatId?: number;
  chatTitle?: string;
}

export interface MyStorageInfo {
  used: number;
  quota: number; // bytes, 0 = no limit
  count: number;
  quotaMode: "block" | "oldest";
  rules: { largeFileMB: number; largeFileDays: number; mediaRetentionDays: number };
  largest: StorageFile[];
}

/** The user's own storage numbers, shared by settings and the send preview. */
export const useMyStorage = create<{
  info: MyStorageInfo | null;
  load(): Promise<MyStorageInfo | null>;
}>((set) => ({
  info: null,
  async load() {
    try {
      const info = await get<MyStorageInfo>("/api/me/storage");
      set({ info });
      return info;
    } catch {
      return null;
    }
  },
}));

const kindIcon: Record<string, string> = {
  image: "image",
  video: "video",
  voice: "mic",
  audio: "speaker",
  file: "file",
};

/** The rule in one sentence, e.g. "Files over 20 MB stay 30 days, the rest a year." */
export function useRuleText() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const cfg = useApp((s) => s.config);
  if (!cfg) return "";
  const days = (d: number) =>
    d > 0 ? t("storage.days", { n: num(d, lang) }) : t("storage.forever");
  if (cfg.largeFileDays === cfg.mediaRetentionDays)
    return t("storage.ruleOne", { d: days(cfg.mediaRetentionDays) });
  return t("storage.rule", {
    mb: num(cfg.largeFileMB, lang),
    big: days(cfg.largeFileDays),
    rest: days(cfg.mediaRetentionDays),
  });
}

/** Settings → "My storage": how much of the quota is used, the largest files and the rule. */
export function MyStorage() {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const { info, load } = useMyStorage();
  const rule = useRuleText();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    load();
  }, [load]);
  if (!info) return null;
  const pct = info.quota > 0 ? Math.min(1, info.used / info.quota) : 0;
  const level = pct >= 1 ? "full" : pct >= 0.9 ? "warn" : "";

  const remove = (f: StorageFile) =>
    confirmAction({
      title: t("storage.deleteTitle"),
      message: t("storage.deleteBody", { name: f.name || t("chat.file") }),
      label: t("common.delete"),
      run: async () => {
        try {
          await del(`/api/me/media/${f.id}`);
          await load();
          useApp.getState().markMediaExpired(f.id);
        } catch (e) {
          useApp.getState().toast(errorText(lang, e), "error");
        }
      },
    });

  return (
    <>
      <div className="section-label">{t("storage.title")}</div>
      <div className="card-group my-storage">
        <div className="item ms-head">
          <div className="grow">
            <div className="ms-numbers">
              <bdi>
                <b>{fileSize(info.used, lang)}</b>
                {info.quota > 0 && <span> / {fileSize(info.quota, lang)}</span>}
              </bdi>
              <span className="muted"> · {t("storage.files", { n: num(info.count, lang) })}</span>
            </div>
            {info.quota > 0 && (
              <div
                className={`ms-bar ${level}`}
                role="progressbar"
                aria-valuenow={Math.round(pct * 100)}
              >
                <i style={{ width: `${pct * 100}%` }} />
              </div>
            )}
            {level && (
              <div className={`ms-warn ${level}`}>
                {t(
                  level === "full"
                    ? info.quotaMode === "oldest"
                      ? "storage.fullOldest"
                      : "storage.full"
                    : "storage.almost",
                )}
              </div>
            )}
            <div className="muted ms-rule">{rule}</div>
          </div>
        </div>
        {info.largest.length > 0 && (
          <button className="item" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            <Icon name="folder" size={18} />
            <div className="grow">{t("storage.largest")}</div>
            <Icon name="down" size={16} className={open ? "rot180" : ""} />
          </button>
        )}
        {open &&
          info.largest.map((f) => (
            <div key={f.id} className="item ms-file">
              <span className="ms-thumb">
                {f.kind === "image" ? (
                  <img src={mediaUrl(f.id, !!f.hasThumb)} alt="" loading="lazy" />
                ) : (
                  <Icon name={kindIcon[f.kind] || "file"} size={18} />
                )}
              </span>
              <div className="grow">
                <div className="ms-name">{f.name || t("chat.file")}</div>
                <div className="muted">
                  <bdi>{fileSize(f.size, lang)}</bdi>
                  {f.chatTitle && ` · ${f.chatTitle}`}
                  {" · "}
                  {f.expiresAt
                    ? t("storage.until", { d: dateOf(f.expiresAt, lang) })
                    : t("storage.forever")}
                </div>
              </div>
              <button
                className="icon-btn"
                onClick={() => remove(f)}
                aria-label={t("common.delete")}
              >
                <Icon name="trash" size={17} />
              </button>
            </div>
          ))}
      </div>
    </>
  );
}
