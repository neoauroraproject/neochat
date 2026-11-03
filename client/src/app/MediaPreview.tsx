import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { create } from "zustand";
import { Icon } from "../components/Icon";
import { Modal } from "../components/ui";
import { fileSize } from "../format";
import { translate, useT } from "../i18n";
import { useApp } from "../store";

interface Item {
  id: number;
  file: File;
  kind: "image" | "video" | "file";
  url?: string;
  selected: boolean;
}

let nextId = 1;

const kindOf = (f: File): Item["kind"] =>
  f.type.startsWith("image/") && !f.type.includes("svg")
    ? "image"
    : f.type.startsWith("video/")
      ? "video"
      : "file";

/**
 * Files waiting in the send preview. Picking, pasting and dropping all land here first, so
 * people see what they are about to send, untick what they do not want and add a caption.
 */
interface StagedState {
  chatId: number | null;
  items: Item[];
  add(chatId: number, files: FileList | File[]): void;
  clear(): void;
}

export const useStaged = create<StagedState>((set, get) => ({
  chatId: null,
  items: [],
  add(chatId, files) {
    const cfg = useApp.getState().config;
    const lang = useApp.getState().lang;
    const fresh: Item[] = [];
    for (const file of Array.from(files)) {
      const kind = kindOf(file);
      const limit =
        kind === "image" ? cfg?.maxImageMB : kind === "video" ? cfg?.maxVideoMB : cfg?.maxFileMB;
      if (limit && file.size > limit * 1024 * 1024) {
        useApp.getState().toast(translate(lang, "chat.tooLarge", { n: limit }), "error");
        continue;
      }
      const url = kind === "file" ? undefined : URL.createObjectURL(file);
      fresh.push({ id: nextId++, file, kind, url, selected: true });
    }
    if (!fresh.length) return;
    // Files for another chat are dropped; the preview belongs to one conversation.
    const keep = get().chatId === chatId ? get().items : [];
    if (get().chatId !== chatId) get().items.forEach((i) => i.url && URL.revokeObjectURL(i.url));
    set({ chatId, items: [...keep, ...fresh] });
  },
  clear() {
    get().items.forEach((i) => i.url && URL.revokeObjectURL(i.url));
    set({ chatId: null, items: [] });
  },
}));

export function MediaPreview({
  chatId,
  initialCaption,
  onSend,
}: {
  chatId: number;
  initialCaption: string;
  onSend: (files: File[], caption: string) => void;
}) {
  const t = useT();
  const lang = useApp((s) => s.lang);
  const maxLen = useApp((s) => s.config?.maxMessageLen);
  const { items, clear } = useStaged();
  const [caption, setCaption] = useState(initialCaption);
  const capRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) capRef.current?.focus();
  }, []);
  useLayoutEffect(() => {
    const el = capRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [caption]);

  const chosen = items.filter((i) => i.selected);
  const toggle = (id: number) =>
    useStaged.setState((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i)),
    }));
  const remove = (id: number) => {
    const it = items.find((i) => i.id === id);
    if (it?.url) URL.revokeObjectURL(it.url);
    const rest = items.filter((i) => i.id !== id);
    if (rest.length) useStaged.setState({ items: rest });
    else clear();
  };
  const addMore = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = () => input.files && useStaged.getState().add(chatId, input.files);
    input.click();
  };
  const send = () => {
    if (!chosen.length) return;
    onSend(
      chosen.map((i) => i.file),
      caption.trim(),
    );
    clear();
  };

  const single = items.length === 1 ? items[0] : null;
  const media = items.every((i) => i.kind !== "file");

  return (
    <Modal
      title={
        chosen.length === items.length
          ? t(media ? "media.sendMedia" : "media.sendFiles", { n: items.length })
          : t("media.selected", { n: chosen.length, total: items.length })
      }
      onClose={clear}
      footer={
        <div className="mp-foot">
          <button className="icon-btn" onClick={addMore} aria-label={t("media.add")}>
            <Icon name="plus" size={20} />
          </button>
          <textarea
            ref={capRef}
            className="mp-caption"
            rows={1}
            value={caption}
            maxLength={maxLen}
            placeholder={t("media.caption")}
            onChange={(e) => setCaption(e.target.value)}
            onKeyDown={(e) => {
              const coarse = window.matchMedia("(pointer: coarse)").matches;
              if (e.key === "Enter" && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            className="send mp-send"
            onClick={send}
            disabled={!chosen.length}
            aria-label={t("chat.send")}
          >
            <Icon name="plane" size={19} filled />
            {chosen.length > 1 && <span className="mp-count">{chosen.length}</span>}
          </button>
        </div>
      }
    >
      {single && single.kind !== "file" ? (
        <div className="mp-single">
          {single.kind === "image" ? (
            <img src={single.url} alt={single.file.name} />
          ) : (
            <video src={single.url} controls playsInline preload="metadata" />
          )}
        </div>
      ) : (
        <div className={media ? "mp-grid" : "mp-list"}>
          {items.map((it) =>
            !media ? (
              <div key={it.id} className={`mp-file${it.selected ? "" : " off"}`}>
                <button
                  className="mp-check"
                  onClick={() => toggle(it.id)}
                  aria-pressed={it.selected}
                >
                  {it.selected && <Icon name="check" size={14} stroke={3} />}
                </button>
                <span className="mp-file-icon">
                  {it.kind === "image" ? (
                    <img src={it.url} alt="" />
                  ) : (
                    <Icon name={it.kind === "video" ? "video" : "file"} size={20} />
                  )}
                </span>
                <div className="grow">
                  <div className="mp-name">{it.file.name}</div>
                  <div className="muted">{fileSize(it.file.size, lang)}</div>
                </div>
                <button
                  className="icon-btn"
                  onClick={() => remove(it.id)}
                  aria-label={t("common.delete")}
                >
                  <Icon name="x" size={16} />
                </button>
              </div>
            ) : (
              <div key={it.id} className={`mp-tile${it.selected ? "" : " off"}`}>
                <button
                  className="mp-tile-body"
                  onClick={() => toggle(it.id)}
                  aria-pressed={it.selected}
                >
                  {it.kind === "image" ? (
                    <img src={it.url} alt={it.file.name} />
                  ) : (
                    <>
                      <video src={it.url + "#t=0.1"} muted playsInline preload="metadata" />
                      <span className="mp-play">
                        <Icon name="play" size={16} filled />
                      </span>
                    </>
                  )}
                </button>
                <span className="mp-check">
                  {it.selected && <Icon name="check" size={14} stroke={3} />}
                </span>
                <button
                  className="mp-remove"
                  onClick={() => remove(it.id)}
                  aria-label={t("common.delete")}
                >
                  <Icon name="x" size={12} stroke={2.6} />
                </button>
              </div>
            ),
          )}
          {media && (
            <button className="mp-tile mp-add" onClick={addMore} aria-label={t("media.add")}>
              <Icon name="plus" size={26} />
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
