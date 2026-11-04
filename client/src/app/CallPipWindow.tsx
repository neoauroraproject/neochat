import { useState } from "react";
import { createPortal } from "react-dom";
import { useCall } from "../call";
import { Icon } from "../components/Icon";
import { useT } from "../i18n";
import { closePips, usePip } from "../pip";
import { useApp } from "../store";
import { useStream } from "./CallFloat";

/**
 * Desktop always-on-top window (Document Picture-in-Picture): the other person's video, our own
 * camera, the call buttons and a small chat with the same person, above every other app.
 */
export function CallPipWindow() {
  const win = usePip((s) => s.docWindow);
  if (!win) return null;
  return createPortal(<PipContent />, win.document.body);
}

function PipContent() {
  const t = useT();
  const st = useCall();
  const me = useApp((s) => s.me);
  const msgs = useApp((s) => (st.chatId ? s.messages[st.chatId] : undefined));
  const remote = useStream<HTMLVideoElement>(st.remoteStream);
  const local = useStream<HTMLVideoElement>(st.localStream);
  const [text, setText] = useState("");
  const recent = (msgs || []).filter((m) => m.kind !== "call" && m.kind !== "system").slice(-4);
  const send = () => {
    const v = text.trim();
    if (!v || !st.chatId) return;
    useApp.getState().sendText(st.chatId, v);
    setText("");
  };
  return (
    <div className="pipw">
      <div className="pipw-stage">
        <video ref={remote} autoPlay playsInline muted className="pipw-remote" />
        {st.localStream?.getVideoTracks().length ? (
          <video ref={local} autoPlay playsInline muted className="pipw-local" />
        ) : null}
        <div className="pipw-name">{st.peer?.displayName}</div>
      </div>
      <div className="pipw-ctl">
        <button
          onClick={st.toggleMute}
          className={st.muted ? "on" : ""}
          aria-label={t("call.mute")}
        >
          <Icon name={st.muted ? "mic-off" : "mic"} size={18} />
        </button>
        <button
          onClick={st.toggleCamera}
          className={st.cameraOff ? "on" : ""}
          aria-label={t("call.camera")}
        >
          <Icon name={st.cameraOff ? "video-off" : "video"} size={18} />
        </button>
        <button
          onClick={() => {
            window.focus();
            closePips();
          }}
          aria-label={t("call.backToCall")}
        >
          <Icon name="external" size={17} />
        </button>
        <button onClick={st.hangup} className="end" aria-label={t("call.end")}>
          <Icon name="phone-down" size={18} />
        </button>
      </div>
      <div className="pipw-chat">
        {recent.map((m) => (
          <div key={m.id} className={`pipw-msg${m.senderId === me?.id ? " mine" : ""}`}>
            {m.text || (m.media ? `📎 ${m.media.name || t("chat.file")}` : "")}
          </div>
        ))}
        <form
          className="pipw-input"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("chat.placeholder")}
            dir="auto"
          />
          <button type="submit" aria-label={t("chat.send")}>
            <Icon name="plane" size={16} filled />
          </button>
        </form>
      </div>
    </div>
  );
}
