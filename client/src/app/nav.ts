import { useEffect, useRef, useState } from "react";
import { translate } from "../i18n";
import { isIOS, isStandalone } from "../pwa";
import { useApp } from "../store";

/**
 * One stack of layers (chat, info, media viewer, sheets, full-screen call) mirrored 1:1 in the
 * browser history. Every entry we push carries its depth (`nc`), so:
 *  - back (button, gesture, Android key) always closes exactly the top layer;
 *  - forward into an entry whose layer is gone quietly returns to the right depth instead of
 *    showing an empty screen (the iOS opposite-edge swipe);
 *  - closing a layer from the UI consumes its entry, so no stale "forward" is left behind.
 */
interface Layer {
  key: string;
  close: () => void;
}

const stack: Layer[] = [];
let pendingBack = 0;
let flushQueued = false;
let seq = 0;

const ua = navigator.userAgent;
/** Installed Android app: one extra entry under the list catches the back key so it can ask first. */
const exitGuard = isStandalone() && !isIOS && /Android/.test(ua);
let exitArmedAt = 0;

const depthOf = (state: unknown): number => {
  const nc = (state as { nc?: unknown } | null)?.nc;
  return typeof nc === "number" ? nc : exitGuard ? -1 : 0;
};
const keep = (nc: number) => ({ ...(history.state || {}), nc });

if (exitGuard) {
  if (depthOf(history.state) !== 0) {
    history.replaceState({ nc: -1 }, "");
    history.pushState({ nc: 0 }, "");
  }
} else history.replaceState(keep(0), "");

function closeTo(depth: number) {
  while (stack.length > depth) stack.pop()!.close();
}

function flush() {
  flushQueued = false;
  const n = pendingBack;
  pendingBack = 0;
  if (n > 0) {
    markOwnStep();
    history.go(-n);
  }
}

function push(close: () => void): string {
  const key = `l${++seq}`;
  stack.push({ key, close });
  if (pendingBack > 0) {
    // A layer was just closed in the same tick (switching chats, menu → sheet): reuse its entry.
    pendingBack--;
    history.replaceState(keep(stack.length), "");
  } else history.pushState({ nc: stack.length }, "");
  return key;
}

function remove(key: string) {
  const i = stack.findIndex((l) => l.key === key);
  if (i < 0) return; // already closed by a history step
  const gone = stack.splice(i);
  // Layers above the one being closed go with it, top first.
  gone
    .slice(1)
    .reverse()
    .forEach((l) => l.close());
  pendingBack += gone.length;
  if (!flushQueued) {
    flushQueued = true;
    queueMicrotask(flush);
  }
}

// --- edge gestures on iOS ---------------------------------------------------------------------

/** Where the current/last touch began and when it ended, to tell a system swipe from a tap. */
let edgeTouch: { at: number; ended: number } | null = null;
const NATIVE_KEY = "neochat.nativeSwipe";
let nativeSwipe = (() => {
  try {
    return localStorage.getItem(NATIVE_KEY) === "1";
  } catch {
    return false;
  }
})();
const nativeListeners = new Set<(v: boolean) => void>();
let ownStepAt = 0;

/** A history step we start ourselves (our swipe, a back button, a closed layer), not the system's. */
export function markOwnStep() {
  ownStepAt = performance.now();
}

/** True when the last back came from the iOS edge gesture (it already animated the screen away). */
export function backWasSystemGesture(): boolean {
  return (
    !!edgeTouch &&
    performance.now() - ownStepAt > 700 &&
    (edgeTouch.ended === 0 || performance.now() - edgeTouch.ended < 700)
  );
}

/** Whether our own edge swipe is off because this iOS version keeps its system gesture. */
export function useNativeSwipe() {
  const [v, setV] = useState(nativeSwipe);
  useEffect(() => {
    nativeListeners.add(setV);
    return () => {
      nativeListeners.delete(setV);
    };
  }, []);
  return v;
}

const EDGE = 20;
if (isIOS) {
  // In the installed iOS app the system back/forward swipe fights ours (and forward led to a
  // blank page). Touches that begin at the very edge are claimed so only the app's swipe runs.
  // If this iOS ignores that and still navigates, the next system swipe is detected below and we
  // step aside: our swipe turns off and the system one drives the same history stack.
  document.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      if (!t || e.touches.length > 1) return;
      const atEdge = t.clientX < EDGE || t.clientX > window.innerWidth - EDGE;
      edgeTouch = atEdge ? { at: performance.now(), ended: 0 } : null;
      if (!atEdge || nativeSwipe || !isStandalone()) return;
      const el = e.target as HTMLElement | null;
      if (
        el?.closest("input, textarea, select, button, a, [role=button], [contenteditable], video")
      )
        return;
      if (e.cancelable) e.preventDefault();
    },
    { capture: true, passive: false },
  );
  const end = () => {
    if (edgeTouch && !edgeTouch.ended) edgeTouch.ended = performance.now();
  };
  document.addEventListener("touchend", end, { capture: true, passive: true });
  document.addEventListener("touchcancel", end, { capture: true, passive: true });
}

window.addEventListener("popstate", (e) => {
  const target = depthOf(e.state);
  if (isIOS && isStandalone() && !nativeSwipe && backWasSystemGesture() && target < stack.length) {
    nativeSwipe = true;
    try {
      localStorage.setItem(NATIVE_KEY, "1");
    } catch {
      /* private mode */
    }
    nativeListeners.forEach((fn) => fn(true));
  }
  if (target < 0) {
    // Back on the chat list of the installed Android app: ask once before leaving.
    closeTo(0);
    const now = Date.now();
    if (now - exitArmedAt < 2000) {
      history.back();
      return;
    }
    exitArmedAt = now;
    const s = useApp.getState();
    s.toast(translate(s.lang, "nav.exitAgain"));
    history.pushState({ nc: 0 }, "");
    return;
  }
  if (target < stack.length) closeTo(target);
  else if (target > stack.length) history.go(stack.length - target); // a layer that no longer exists
});

/**
 * Registers a layer while `open` is true. Back closes it through `close`; closing it any other way
 * (its own button, the state changing) takes its history entry with it.
 */
export function useLayer(open: boolean, close: () => void) {
  const fn = useRef(close);
  fn.current = close;
  useEffect(() => {
    if (!open) return;
    const key = push(() => fn.current());
    return () => remove(key);
  }, [open]);
}

/** The back button in a header: a history step when a layer is open, so everything stays in sync. */
export function goBack() {
  markOwnStep();
  if (stack.length) history.back();
  else useApp.getState().openChat(null);
}

/** Number of open layers (for tests and debugging). */
export const layerDepth = () => stack.length;
