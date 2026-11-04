import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { Menu } from "../components/ui";
import { duration, preview } from "../format";
import { useT } from "../i18n";
import { useApp } from "../store";
import type { Chat, Message } from "../types";
import { wsSend } from "../ws";
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
  const [rec, setRec] = useState<{ start: number; recorder: MediaRecorder; chunks: Blob[] } | null>(
    null,
  );
  const [recTime, setRecTime] = useState(0);
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

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const mime =
        ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"].find((m) =>
          MediaRecorder.isTypeSupported(m),
        ) || "";
      const recorder = new MediaRecorder(
        stream,
        mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined,
      );
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.start(250);
      setRec({ start: Date.now(), recorder, chunks });
      setRecTime(0);
      navigator.vibrate?.(15);
    } catch {
      useApp.getState().toast(t("call.noMedia"), "error");
    }
  };

  const stopRec = (sendIt: boolean) => {
    if (!rec) return;
    const { recorder, chunks, start } = rec;
    recorder.onstop = () => {
      recorder.stream.getTracks().forEach((tr) => tr.stop());
      if (!sendIt || Date.now() - start < 700) return;
      const type = recorder.mimeType || "audio/webm";
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      const blob = new Blob(chunks, { type });
      useApp.getState().sendFile(chat.id, blob, { kind: "voice", name: `voice.${ext}`, replyTo });
      onCancel();
      onSent();
    };
    recorder.stop();
    setRec(null);
  };

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
      <div className={`composer${rec ? " recording" : ""}`}>
        {rec ? (
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
                <button className="icon-btn" onClick={startRec} aria-label={t("chat.voice")}>
                  <Icon name="mic" size={20} />
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
