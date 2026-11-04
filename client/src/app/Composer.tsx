import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { Menu } from "../components/ui";
import { duration, preview } from "../format";
import { useT } from "../i18n";
import { useApp } from "../store";
import type { Chat, Message } from "../types";
import { wsSend } from "../ws";
import { extensionFor, getMic, recorderFormat, releaseMicSoon } from "../voice";
import { useMedia } from "./hooks";
import { LockComposer } from "./LockComposer";
import { MediaPreview, useStaged } from "./MediaPreview";

const EMOJI =
  "😀 😂 🥲 😍 😘 😎 🤔 😴 😭 😡 👍 👎 👏 🙏 💪 🔥 ❤️ 💔 🎉 ✨ ✅ ❌ ⭐ 🌹 ☕ 🍰 ⚽ 🎵 📷 📌 🙂 😉 😅 🤝 👋 🤗 😢 😱 💯 🌙".split(
    " ",
  );

interface Props {
  chat: Chat;
  replyTo: Message | null;
  editing: Message | null;
  onCancel: () => void;
  onSent: () => void;
}

export function Composer({ chat, replyTo, editing, onCancel, onSent }: Props) {
  const [locking, setLocking] = useState(false);
  const t = useT();
  const lang = useApp((s) => s.lang);
  const config = useApp((s) => s.config);
  const draft = useApp((s) => s.drafts[chat.id] || "");
  const [text, setText] = useState(draft);
  const [attachMenu, setAttachMenu] = useState<{ x: number; y: number } | null>(null);
  const stagedFor = useStaged((s) => (s.items.length ? s.chatId : null));
  const [emoji, setEmoji] = useState(false);
  const [rec, setRec] = useState<{
    start: number;
    recorder: MediaRecorder;
    chunks: Blob[];
    /** Hands-free: the finger is up and the trash and send buttons are shown. */
    locked: boolean;
  } | null>(null);
  const recRef = useRef(rec);
  recRef.current = rec;
  const [recTime, setRecTime] = useState(0);
  /** The press on the microphone button while it is held. */
  const hold = useRef<{
    id: number;
    x0: number;
    y0: number;
    t0: number;
    released: boolean;
    done: boolean;
  } | null>(null);
  const [slide, setSlide] = useState({ x: 0, y: 0 });
  const ta = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);
  const coarse = useMedia("(pointer: coarse)");

  // Switching chats restores that chat's draft.
  useEffect(() => {
    setText(useApp.getState().drafts[chat.id] || "");
    setEmoji(false);
  }, [chat.id]);
  useEffect(() => {
    if (editing) {
      setText(editing.text);
      ta.current?.focus();
    }
  }, [editing]);
  useEffect(() => {
    if (replyTo) ta.current?.focus();
  }, [replyTo]);
  useEffect(() => {
    if (!editing) useApp.getState().setDraft(chat.id, text);
  }, [text, chat.id, editing]);

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [text]);

  useEffect(() => {
    if (!rec) return;
    const id = setInterval(() => setRecTime((Date.now() - rec.start) / 1000), 200);
    return () => clearInterval(id);
  }, [rec]);

  const typing = (action = "typing") => {
    const now = Date.now();
    if (now - lastTyping.current > 3000) {
      lastTyping.current = now;
      wsSend("typing", { chatId: chat.id, action });
    }
  };

  const send = async () => {
    const value = text.trim();
    if (!value) return;
    if (editing) {
      try {
        await useApp.getState().editMessage(editing.id, value);
      } catch {
        useApp.getState().toast(t("err.generic"), "error");
      }
      setText(useApp.getState().drafts[chat.id] || "");
      onCancel();
      return;
    }
    useApp.getState().sendText(chat.id, value, replyTo);
    setText("");
    useApp.getState().setDraft(chat.id, "");
    lastTyping.current = 0;
    onCancel();
    onSent();
  };

  // Picked, pasted and dropped files open the send preview first.
  const sendFiles = (files: FileList | File[]) => useStaged.getState().add(chat.id, files);

  // Like Telegram: the reply goes on the first file, the caption under the last one.
  const sendStaged = (
    list: File[],
    caption: string,
    opts: { original: boolean; once: boolean },
  ) => {
    typing("uploading");
    list.forEach((f, i) =>
      useApp.getState().sendFile(chat.id, f, {
        replyTo: i === 0 ? replyTo : null,
        caption: i === list.length - 1 ? caption : undefined,
        original: opts.original && f.type.startsWith("image/"),
        once: opts.once,
      }),
    );
    if (caption && caption === text.trim()) {
      setText("");
      useApp.getState().setDraft(chat.id, "");
    }
    onCancel();
    onSent();
  };

  const pick = (accept: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = true;
    input.onchange = () => input.files && sendFiles(input.files);
    input.click();
  };

  /** Starts recording; `h` is the press when the microphone button is being held down. */
  const startRec = async (h: NonNullable<typeof hold.current> | null) => {
    if (recRef.current) return;
    let stream: MediaStream;
    try {
      stream = await getMic();
    } catch {
      hold.current = null;
      useApp.getState().toast(t("voice.noMic"), "error");
      return;
    }
    // Slid away to cancel while the permission question was on screen.
    if (h?.done) {
      releaseMicSoon();
      return;
    }
    const mime = recorderFormat();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(
        stream,
        mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined,
      );
    } catch {
      recorder = new MediaRecorder(stream);
    }
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    // One piece at the end: Safari's sliced MP4 pieces do not always join into a playable file.
    recorder.start();
    // Let go while the permission question was on screen (or tapped): record hands-free.
    const locked = !h || h.released;
    if (locked) hold.current = null;
    setRec({ start: Date.now(), recorder, chunks, locked });
    setRecTime(0);
    navigator.vibrate?.(15);
  };

  const stopRec = (sendIt: boolean) => {
    const r = recRef.current;
    hold.current = null;
    setSlide({ x: 0, y: 0 });
    if (!r) return;
    const { recorder, chunks, start } = r;
    recorder.onstop = () => {
      releaseMicSoon();
      if (!sendIt || Date.now() - start < 700) return;
      const type = recorder.mimeType || chunks[0]?.type || "audio/webm";
      const blob = new Blob(chunks, { type });
      useApp
        .getState()
        .sendFile(chat.id, blob, { kind: "voice", name: `voice.${extensionFor(type)}`, replyTo });
      onCancel();
      onSent();
    };
    if (recorder.state !== "inactive") recorder.stop();
    else recorder.onstop?.(new Event("stop"));
    setRec(null);
  };

  // Hold to record, let go to send, slide toward the text to cancel, slide up to keep recording
  // hands-free. A short tap also starts hands-free recording, which is easier on a desktop.
  const onMicDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || recRef.current || editing) return;
    e.preventDefault();
    const rtl = document.documentElement.dir === "rtl";
    const h = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      t0: Date.now(),
      released: false,
      done: false,
    };
    hold.current = h;
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== h.id || h.done || h.released) return;
      const x = (rtl ? 1 : -1) * (ev.clientX - h.x0); // toward the text field
      const y = h.y0 - ev.clientY; // upward
      setSlide({ x: Math.max(0, x), y: Math.max(0, y) });
      if (x > 110) {
        h.done = true;
        finish();
        navigator.vibrate?.(10);
        stopRec(false);
      } else if (y > 80 && recRef.current) {
        h.done = true;
        finish();
        navigator.vibrate?.(10);
        hold.current = null;
        setSlide({ x: 0, y: 0 });
        setRec((r) => (r ? { ...r, locked: true } : r));
      }
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== h.id) return;
      finish();
      if (h.done) return;
      h.released = true;
      if (!recRef.current) return; // still asking for permission: recording starts hands-free
      // A system alert or scroll cancels the touch: keep the recording instead of losing it.
      if (ev.type === "pointercancel" || Date.now() - h.t0 < 350) {
        hold.current = null;
        setSlide({ x: 0, y: 0 });
        setRec((r) => (r ? { ...r, locked: true } : r));
      } else stopRec(true);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    startRec(h);
  };

  // Leaving the chat (or the app) never leaves the microphone recording.
  useEffect(
    () => () => {
      const r = recRef.current;
      if (r && r.recorder.state !== "inactive") {
        r.recorder.onstop = () => releaseMicSoon();
        r.recorder.stop();
      }
    },
    [chat.id],
  );

  useEffect(() => {
    if (rec) {
      const id = setInterval(
        () => wsSend("typing", { chatId: chat.id, action: "recording" }),
        3000,
      );
      return () => clearInterval(id);
    }
  }, [rec, chat.id]);

  // Paste images straight from the clipboard.
  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      sendFiles(files);
    }
  };

  const bar = editing || replyTo;
  return (
    <div className="composer-wrap" style={{ position: "relative" }}>
      {bar && (
        <div className="composer-bar">
          <Icon name={editing ? "edit" : "reply"} size={18} />
          <div className="grow">
            <b>{editing ? t("chat.editing") : replyTo!.sender.displayName}</b>
            <span>{preview(editing || replyTo!, lang)}</span>
          </div>
          <button
            className="icon-btn"
            style={{ width: 32, height: 32 }}
            onClick={() => {
              if (editing) setText(useApp.getState().drafts[chat.id] || "");
              onCancel();
            }}
            aria-label={t("common.cancel")}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      )}
      {emoji && (
        <div className="emoji-pop glass-float">
          {EMOJI.map((e) => (
            <button
              key={e}
              onClick={() => {
                setText((v) => v + e);
                ta.current?.focus();
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      <div
        className={`composer${rec?.locked ? " recording" : ""}${rec && !rec.locked ? " holding" : ""}`}
      >
        {rec?.locked ? (
          <div className="field-pill">
            <button
              className="icon-btn"
              onClick={() => stopRec(false)}
              aria-label={t("common.cancel")}
            >
              <Icon name="trash" size={20} />
            </button>
            <div className="rec-indicator">
              <span className="dot" />
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{duration(recTime, lang)}</span>
              <span>{t("chat.recording")}</span>
            </div>
            <button className="send" onClick={() => stopRec(true)} aria-label={t("chat.send")}>
              <Icon name="plane" size={19} filled />
            </button>
          </div>
        ) : (
          <div className="field-pill">
            {rec && (
              <div className="rec-hold" aria-live="polite">
                <span className="dot" />
                <span className="rec-time">{duration(recTime, lang)}</span>
                <span
                  className="rec-cancel"
                  style={{
                    transform: `translateX(${(document.documentElement.dir === "rtl" ? 1 : -1) * Math.min(slide.x, 110) * 0.5}px)`,
                    opacity: Math.max(0.15, 1 - slide.x / 130),
                  }}
                >
                  <Icon name="back" size={15} className="flip-rtl" />
                  {t("voice.slideCancel")}
                </span>
              </div>
            )}
            <textarea
              ref={ta}
              rows={1}
              value={text}
              placeholder={t("chat.placeholder")}
              maxLength={config?.maxMessageLen}
              enterKeyHint={coarse ? "enter" : "send"}
              onChange={(e) => {
                setText(e.target.value);
                if (e.target.value) typing();
              }}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
                if (e.key === "Escape" && bar) onCancel();
              }}
            />
            <div className="tools">
              {!coarse && (
                <button className="icon-btn" onClick={() => setEmoji(!emoji)} aria-label="emoji">
                  <Icon name="smile" size={20} />
                </button>
              )}
              <button
                className="icon-btn"
                aria-label={t("chat.attach")}
                disabled={!!editing}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setAttachMenu({ x: lang === "fa" ? r.left : r.right - 210, y: r.top - 110 });
                }}
              >
                <Icon name="attach" size={20} />
              </button>
              {!text.trim() && !editing && (
                <button
                  className="icon-btn mic-btn"
                  onPointerDown={onMicDown}
                  onContextMenu={(e) => e.preventDefault()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      startRec(null);
                    }
                  }}
                  aria-label={t("voice.hold")}
                  title={t("voice.hold")}
                >
                  <Icon name="mic" size={20} />
                  {rec && !rec.locked && (
                    <span
                      className="rec-lock"
                      style={{ transform: `translateY(${-Math.min(slide.y, 80) * 0.45}px)` }}
                      title={t("voice.slideLock")}
                    >
                      <Icon name="lock" size={13} />
                      <Icon name="down" size={11} stroke={2.4} className="up" />
                    </span>
                  )}
                </button>
              )}
            </div>
            <button
              className="send"
              onClick={() => (text.trim() ? send() : ta.current?.focus())}
              aria-label={t("chat.send")}
            >
              <Icon name={editing ? "check" : "plane"} size={19} filled={!editing} stroke={2.4} />
              <span className="send-label">{t(editing ? "common.save" : "chat.send")}</span>
            </button>
          </div>
        )}
      </div>
      {locking && <LockComposer chat={chat} onClose={() => setLocking(false)} />}
      {stagedFor === chat.id && (
        <MediaPreview
          chatId={chat.id}
          initialCaption={text.trim()}
          onSend={sendStaged}
          allowOnce={chat.type === "direct" && !chat.saved}
        />
      )}
      {attachMenu && (
        <Menu
          x={attachMenu.x}
          y={attachMenu.y}
          onClose={() => setAttachMenu(null)}
          items={[
            { icon: "image", label: t("chat.photoVideo"), onClick: () => pick("image/*,video/*") },
            { icon: "file", label: t("chat.file"), onClick: () => pick("*/*") },
            { icon: "lock", label: t("lock.new"), onClick: () => setLocking(true) },
          ]}
        />
      )}
    </div>
  );
}
