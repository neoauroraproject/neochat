import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n";

/**
 * Web apps cannot read the phone's proximity sensor, so during a voice call the screen would stay
 * on against the cheek and the cheek would press mute or hang up. This stands in for it:
 *  - raised to the ear (the phone held upright for a moment), the screen turns fully black and
 *    ignores touches;
 *  - lowered again to look at it, or swiped up, it comes back;
 *  - where the tilt cannot be read, it goes black after a few seconds without a touch.
 */

let motionAsked = false;
/** iOS asks before sharing the phone's tilt; the question must come straight from a tap. */
export function askMotionPermission() {
  if (motionAsked) return;
  motionAsked = true;
  const D = window.DeviceOrientationEvent as unknown as
    { requestPermission?: () => Promise<string> } | undefined;
  D?.requestPermission?.().catch(() => {});
}

const RAISED_MS = 700;
const LOWERED_MS = 400;
const IDLE_MS = 6000;

export function EarGuard({ active }: { active: boolean }) {
  const t = useT();
  const [black, setBlack] = useState(false);
  const [hint, setHint] = useState(false);
  const tilt = useRef({ seen: false, raisedSince: 0, loweredSince: 0 });
  const swipe = useRef<{ id: number; y: number } | null>(null);

  useEffect(() => {
    if (!active) {
      setBlack(false);
      return;
    }
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.beta == null) return;
      const s = tilt.current;
      s.seen = true;
      const b = Math.abs(e.beta);
      const now = performance.now();
      // Held to the ear the phone stands nearly upright; looking at it, it leans back.
      if (b >= 62 && b <= 125) {
        s.loweredSince = 0;
        if (!s.raisedSince) s.raisedSince = now;
        if (now - s.raisedSince > RAISED_MS) setBlack(true);
      } else if (b < 45 || b > 145) {
        s.raisedSince = 0;
        if (!s.loweredSince) s.loweredSince = now;
        if (now - s.loweredSince > LOWERED_MS) setBlack(false);
      }
    };
    window.addEventListener("deviceorientation", onTilt);
    // No tilt readings (denied or no sensor): fall back to going dark when left alone.
    let idle = 0;
    const arm = () => {
      window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        if (!tilt.current.seen) setBlack(true);
      }, IDLE_MS);
    };
    arm();
    window.addEventListener("pointerdown", arm, true);
    return () => {
      window.removeEventListener("deviceorientation", onTilt);
      window.removeEventListener("pointerdown", arm, true);
      window.clearTimeout(idle);
    };
  }, [active]);

  useEffect(() => {
    if (!hint) return;
    const id = window.setTimeout(() => setHint(false), 2200);
    return () => window.clearTimeout(id);
  }, [hint]);

  if (!active || !black) return null;
  return createPortal(
    <div
      className="ear-guard"
      aria-hidden="true"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        swipe.current = { id: e.pointerId, y: e.clientY };
        setHint(true);
      }}
      onPointerMove={(e) => {
        const s = swipe.current;
        if (s && s.id === e.pointerId && s.y - e.clientY > 110) {
          swipe.current = null;
          tilt.current.raisedSince = 0;
          setBlack(false);
        }
      }}
      onPointerUp={() => (swipe.current = null)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className={`ear-hint${hint ? " on" : ""}`}>{t("call.earUnlock")}</span>
    </div>,
    document.body,
  );
}
