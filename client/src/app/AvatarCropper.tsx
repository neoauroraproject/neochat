import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { Icon } from "../components/Icon";
import { pickFile } from "../components/ui";
import { useT } from "../i18n";
import { decodeImage } from "../imagecompress";
import { useLayer } from "./nav";

/**
 * Profile and room photos are framed before upload, like Telegram: the photo opens behind a round
 * window, you move it with a finger, pinch (or use the slider) to zoom and can turn it by 90°.
 * The result is drawn upright into a square JPEG, so it looks the same everywhere: the small
 * round avatar, the chat list and the large profile header.
 */

interface Request {
  file: File;
  resolve: (f: File | null) => void;
}
const useCrop = create<{ req: Request | null }>(() => ({ req: null }));

export function cropAvatar(file: File): Promise<File | null> {
  return new Promise((resolve) => {
    useCrop.getState().req?.resolve(null);
    useCrop.setState({ req: { file, resolve } });
  });
}

/** Opens the gallery, then the crop screen. Resolves with the framed photo, or null. */
export async function pickAvatar(): Promise<File | null> {
  const f = await pickFile("image/*");
  return f ? cropAvatar(f) : null;
}

export function CropperHost() {
  const req = useCrop((s) => s.req);
  if (!req) return null;
  const finish = (f: File | null) => {
    req.resolve(f);
    useCrop.setState({ req: null });
  };
  return <AvatarCropper key={req.file.name + req.file.size} file={req.file} onDone={finish} />;
}

const OUT_MAX = 1080;

interface View {
  x: number; // offset of the photo's center from the window's center, in screen px
  y: number;
  s: number; // screen px per photo px
  rot: number; // quarter turns clockwise
}

function AvatarCropper({ file, onDone }: { file: File; onDone: (f: File | null) => void }) {
  const t = useT();
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [src, setSrc] = useState<Awaited<ReturnType<typeof decodeImage>> | null>(null);
  const [failed, setFailed] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const view = useRef<View>({ x: 0, y: 0, s: 1, rot: 0 });
  const [, redraw] = useState(0);
  const [busy, setBusy] = useState(false);
  const cancel = useCallback(() => onDone(null), [onDone]);
  useLayer(true, cancel);

  useEffect(() => {
    let alive = true;
    decodeImage(file)
      .then((d) => (alive ? setSrc(d) : d.done()))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [file]);
  useEffect(() => () => src?.done(), [src]);

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The round window: as wide as the screen allows, with a margin.
  const D = Math.max(120, Math.min(box.w - 40, box.h - 40, 420));
  const dims = (rot: number) =>
    src ? (rot % 2 ? { w: src.h, h: src.w } : { w: src.w, h: src.h }) : { w: 1, h: 1 };
  const limits = (rot: number) => {
    const { w, h } = dims(rot);
    return { cover: D / Math.min(w, h), contain: D / Math.max(w, h) };
  };
  const clamp = (v: View): View => {
    const { cover, contain } = limits(v.rot);
    const s = Math.min(cover * 6, Math.max(contain, v.s));
    const { w, h } = dims(v.rot);
    const ex = Math.max(0, (w * s - D) / 2);
    const ey = Math.max(0, (h * s - D) / 2);
    return {
      rot: v.rot,
      s,
      x: Math.min(ex, Math.max(-ex, v.x)),
      y: Math.min(ey, Math.max(-ey, v.y)),
    };
  };

  // Start filled: the photo covers the round window, centered.
  const started = useRef(false);
  useEffect(() => {
    if (!src || !D || started.current) return;
    started.current = true;
    view.current = { x: 0, y: 0, s: limits(0).cover, rot: 0 };
    redraw((n) => n + 1);
  }, [src, D]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (v: View) => {
    view.current = clamp(v);
    redraw((n) => n + 1);
  };

  // Draw: the photo, a dark veil outside the circle and a thin ring.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !src || !box.w) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = Math.round(box.w * dpr);
    c.height = Math.round(box.h * dpr);
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, box.w, box.h);
    const v = view.current;
    const cx = box.w / 2;
    const cy = box.h / 2;
    g.save();
    g.translate(cx + v.x, cy + v.y);
    g.rotate((v.rot * Math.PI) / 2);
    g.scale(v.s, v.s);
    g.imageSmoothingQuality = "high";
    g.drawImage(src.img, -src.w / 2, -src.h / 2, src.w, src.h);
    g.restore();
    g.beginPath();
    g.rect(0, 0, box.w, box.h);
    g.arc(cx, cy, D / 2, 0, Math.PI * 2, true);
    g.fillStyle = "rgba(0, 0, 0, 0.62)";
    g.fill("evenodd");
    g.beginPath();
    g.arc(cx, cy, D / 2, 0, Math.PI * 2);
    g.strokeStyle = "rgba(255, 255, 255, 0.85)";
    g.lineWidth = 1.5;
    g.stroke();
  });

  // Gestures: one finger moves, two fingers pinch (zooming around the point between them).
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const zoomAt = (v: View, factor: number, px: number, py: number): View => {
    const cx = box.w / 2;
    const cy = box.h / 2;
    const { cover, contain } = limits(v.rot);
    const s = Math.min(cover * 6, Math.max(contain, v.s * factor));
    const f = s / v.s;
    return { ...v, s, x: px - cx - (px - cx - v.x) * f, y: py - cy - (py - cy - v.y) * f };
  };
  const onDown = (e: React.PointerEvent) => {
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* the finger is still tracked through the stage's own events */
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = pts.current.get(e.pointerId);
    if (!prev) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const others = [...pts.current.entries()].filter(([id]) => id !== e.pointerId);
    let v = view.current;
    if (others.length === 0) {
      v = { ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y };
    } else {
      const o = others[0][1];
      const before = Math.hypot(prev.x - o.x, prev.y - o.y) || 1;
      const after = Math.hypot(e.clientX - o.x, e.clientY - o.y) || 1;
      const mx = (e.clientX + o.x) / 2 - r.left;
      const my = (e.clientY + o.y) / 2 - r.top;
      v = zoomAt(v, after / before, mx, my);
      v = { ...v, x: v.x + (e.clientX - prev.x) / 2, y: v.y + (e.clientY - prev.y) / 2 };
    }
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    set(v);
  };
  const onUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
  };
  const onWheel = (e: React.WheelEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    set(zoomAt(view.current, Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top));
  };

  const rotate = () => {
    const v = view.current;
    const rot = (v.rot + 1) % 4;
    // Keep the same framing size: fill the window again after the turn.
    set({ rot, x: v.y * -1, y: v.x, s: Math.max(v.s, limits(rot).contain) });
  };

  const done = async () => {
    if (!src || busy) return;
    setBusy(true);
    const v = view.current;
    // As many output pixels as the photo really has inside the circle, at most 1080.
    const out = Math.max(256, Math.min(OUT_MAX, Math.round(D / v.s)));
    const k = out / D;
    const c = document.createElement("canvas");
    c.width = out;
    c.height = out;
    const g = c.getContext("2d")!;
    // Zoomed out past the edges: fill around the photo with its own average color.
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    const pg = probe.getContext("2d")!;
    pg.drawImage(src.img, 0, 0, 1, 1);
    const [r, gr, b] = pg.getImageData(0, 0, 1, 1).data;
    g.fillStyle = `rgb(${r}, ${gr}, ${b})`;
    g.fillRect(0, 0, out, out);
    g.translate(out / 2 + v.x * k, out / 2 + v.y * k);
    g.rotate((v.rot * Math.PI) / 2);
    g.scale(v.s * k, v.s * k);
    g.imageSmoothingQuality = "high";
    g.drawImage(src.img, -src.w / 2, -src.h / 2, src.w, src.h);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.9));
    setBusy(false);
    onDone(blob ? new File([blob], "avatar.jpg", { type: "image/jpeg" }) : null);
  };

  const keys = useRef({ cancel, done });
  keys.current = { cancel, done };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") keys.current.cancel();
      else if (e.key === "Enter") keys.current.done();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { cover, contain } = limits(view.current.rot);
  const zoom = cover > contain ? (view.current.s - contain) / (cover * 6 - contain) : 0;

  return createPortal(
    <div className="cropper" role="dialog" aria-label={t("crop.title")}>
      <header className="cropper-head">
        <button className="cropper-text" onClick={cancel}>
          {t("common.cancel")}
        </button>
        <b>{t("crop.title")}</b>
        <button className="cropper-text strong" onClick={done} disabled={!src || busy}>
          {busy ? <span className="spinner" /> : t("crop.done")}
        </button>
      </header>
      <div
        className="cropper-stage"
        ref={stage}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={onWheel}
      >
        <canvas ref={canvas} style={{ width: box.w, height: box.h }} />
        {!src && !failed && <span className="spinner cropper-wait" />}
        {failed && <p className="cropper-error">{t("crop.failed")}</p>}
      </div>
      <footer className="cropper-tools">
        <button
          className="cropper-round"
          onClick={rotate}
          aria-label={t("crop.rotate")}
          disabled={!src}
        >
          <Icon name="rotate" size={20} />
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(zoom * 1000)}
          aria-label={t("crop.zoom")}
          disabled={!src}
          onChange={(e) => {
            const f = Number(e.target.value) / 1000;
            const target = contain + f * (cover * 6 - contain);
            set(zoomAt(view.current, target / view.current.s, box.w / 2, box.h / 2));
          }}
        />
        <span className="cropper-hint">{t("crop.hint")}</span>
      </footer>
    </div>,
    document.body,
  );
}
