import { useState } from "react";
import { Icon } from "../components/Icon";
import { Modal, pickFile } from "../components/ui";
import { useT } from "../i18n";
import { lockFile, lockText, weakPassword } from "../lockbox";
import { useApp } from "../store";
import type { Chat } from "../types";

/**
 * Write a message (or pick a photo) that only opens with a password. Encryption happens here,
 * before anything is sent; the password itself is never sent anywhere.
 */
export function LockComposer({ chat, onClose }: { chat: Chat; onClose: () => void }) {
  const t = useT();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const weak = pw.length > 0 && weakPassword(pw);
  const mismatch = pw2.length > 0 && pw !== pw2;
  const ready = (text.trim() || file) && pw && !weak && pw === pw2 && !busy;

  const send = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      if (file) {
        const { envelope, blob } = await lockFile(file, pw, hint);
        useApp.getState().sendLocked(chat.id, envelope, blob);
      } else {
        useApp.getState().sendLocked(chat.id, await lockText(text.trim(), pw, hint));
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t("lock.new")}
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          disabled={!ready}
          onClick={send}
          style={{ width: "100%" }}
        >
          {busy ? <span className="spinner" /> : <Icon name="lock" size={16} />}
          {t("lock.send")}
        </button>
      }
    >
      <div className="lock-compose">
        {file ? (
          <div className="lock-file">
            <Icon name="image" size={18} />
            <span className="grow">{file.name}</span>
            <button
              className="icon-btn"
              onClick={() => setFile(null)}
              aria-label={t("common.delete")}
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        ) : (
          <>
            <textarea
              className="input"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("lock.textPlaceholder")}
              dir="auto"
            />
            <button
              className="btn btn-sm"
              onClick={async () => {
                const f = await pickFile("image/*,video/*");
                if (f) setFile(f);
              }}
            >
              <Icon name="image" size={15} />
              {t("lock.pickPhoto")}
            </button>
          </>
        )}
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder={t("lock.password")}
        />
        {weak && <div className="field-err">{t("lock.weak")}</div>}
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          placeholder={t("lock.repeat")}
        />
        {mismatch && <div className="field-err">{t("lock.mismatch")}</div>}
        <input
          className="input"
          value={hint}
          maxLength={80}
          onChange={(e) => setHint(e.target.value)}
          placeholder={t("lock.hintPlaceholder")}
          dir="auto"
        />
        <p className="muted small">{t("lock.explain")}</p>
      </div>
    </Modal>
  );
}
