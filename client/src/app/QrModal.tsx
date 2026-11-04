import { useEffect, useMemo, useRef, useState } from "react";
import { get } from "../api";
import { Icon } from "../components/Icon";
import { Avatar, Modal } from "../components/ui";
import { useT } from "../i18n";
import { qrSvgPath } from "../qr";
import { useApp } from "../store";
import type { User } from "../types";

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };
const BarcodeDetectorCtor = (
  window as Window & {
    BarcodeDetector?: new (o: { formats: string[] }) => Detector;
  }
).BarcodeDetector;

/** Opens what a scanned code points at: a profile (/@name) or an invite (/join/…). */
async function openScanned(raw: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(raw, location.origin);
  } catch {
    return false;
  }
  const path = decodeURIComponent(url.pathname);
  const handle = path.match(/^\/@(\w+)/);
  if (handle) {
    const r = await get<{ users: User[] }>(`/api/search?q=${encodeURIComponent(handle[1])}`);
    const u = r.users.find((x) => x.username.toLowerCase() === handle[1].toLowerCase());
    if (u) {
      await useApp.getState().openDirect(u.id);
      return true;
    }
  }
  if (/^\/join\//.test(path) && url.origin === location.origin) {
    location.assign(url.pathname);
    return true;
  }
  return false;
}

/**
 * Accounts have no phone numbers, so each person has a QR code of their profile link. Scanning
 * one opens the chat directly; nothing is typed and the internet is not needed (the code points
 * at this server). In-app scanning uses the browser's barcode reader where it has one; elsewhere
 * (iPhone) the system camera reads the code and opens the same link.
 */
const QR_THEMES = [
  { id: "default", key: "qr.tDefault" },
  { id: "feather", key: "qr.tFeather" },
  { id: "gold", key: "qr.tGold" },
  { id: "fresh", key: "qr.tFresh" },
] as const;
type QrTheme = (typeof QR_THEMES)[number]["id"];
const QR_KEY = "neochat.qrTheme";

export function QrModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const me = useApp((s) => s.me)!;
  const [tab, setTab] = useState<"mine" | "scan">("mine");
  const [theme, setThemeState] = useState<QrTheme>(() => {
    try {
      return (localStorage.getItem(QR_KEY) as QrTheme) || "default";
    } catch {
      return "default";
    }
  });
  const setTheme = (v: QrTheme) => {
    setThemeState(v);
    try {
      localStorage.setItem(QR_KEY, v);
    } catch {
      /* private mode */
    }
  };
  const link = `${location.origin}/@${me.username}`;
  const qr = useMemo(() => qrSvgPath(link), [link]);
  const share = () => {
    if (navigator.share) navigator.share({ title: me.displayName, url: link }).catch(() => {});
    else navigator.clipboard?.writeText(link).then(() => useApp.getState().toast(t("qr.copied")));
  };

  return (
    <Modal title={t(tab === "mine" ? "qr.title" : "qr.scan")} onClose={onClose}>
      {tab === "mine" ? (
        <div className="qr-sheet">
          <div className="qr-stage" data-qr={theme}>
            <div className="qr-paper">
              <svg
                viewBox={`0 0 ${qr.size} ${qr.size}`}
                className="qr-svg"
                shapeRendering="crispEdges"
                role="img"
                aria-label={link}
              >
                <path d={qr.d} fill="currentColor" />
              </svg>
              <span className="qr-face">
                <Avatar id={me.id} name={me.displayName} media={me.avatar} size={44} />
              </span>
            </div>
            <b className="qr-handle ltr">@{me.username}</b>
          </div>
          <div className="qr-themes">
            {QR_THEMES.map((x) => (
              <button
                key={x.id}
                className={`qr-theme${theme === x.id ? " on" : ""}`}
                data-qr={x.id}
                onClick={() => setTheme(x.id)}
              >
                <span>
                  <Icon name="grid-qr" size={22} stroke={1.8} />
                </span>
                {t(x.key)}
              </button>
            ))}
          </div>
          <button className="qr-share" onClick={share}>
            <Icon name="share" size={17} />
            {t("qr.shareCode")}
          </button>
          <button className="qr-scan-link" onClick={() => setTab("scan")}>
            <Icon name="camera" size={16} />
            {t("qr.scanOther")}
          </button>
        </div>
      ) : (
        <>
          <Scanner onDone={onClose} />
          <button className="qr-scan-link" onClick={() => setTab("mine")}>
            <Icon name="grid-qr" size={16} />
            {t("qr.mine")}
          </button>
        </>
      )}
    </Modal>
  );
}

function Scanner({ onDone }: { onDone: () => void }) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!BarcodeDetectorCtor) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((tr) => tr.stop());
        stream = s;
        const v = video.current!;
        v.srcObject = s;
        v.play().catch(() => {});
        const tick = async () => {
          if (stopped) return;
          try {
            const found = await detector.detect(v);
            if (found[0] && (await openScanned(found[0].rawValue))) {
              navigator.vibrate?.(20);
              onDone();
              return;
            }
            if (found[0]) setErr(t("qr.unknown"));
          } catch {
            /* frame not ready */
          }
          timer = window.setTimeout(tick, 300);
        };
        tick();
      })
      .catch(() => setErr(t("call.noMedia")));
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [onDone, t]);

  if (!BarcodeDetectorCtor)
    return (
      <div className="qr-card">
        <Icon name="camera" size={34} />
        <p style={{ textAlign: "center" }}>{t("qr.noScanner")}</p>
      </div>
    );
  return (
    <div className="qr-scan">
      <video ref={video} playsInline muted />
      <span className="qr-frame" />
      <p className="muted">{err || t("qr.point")}</p>
    </div>
  );
}
