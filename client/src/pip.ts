import { create } from "zustand";
import { useCall } from "./call";

/**
 * The call over other apps.
 *  - System picture-in-picture (Android, Chrome, Edge, Safari): the other person's video in the
 *    system's floating window. It uses one hidden <video> owned by this module, so it keeps playing
 *    whatever screen the app shows. Chrome may enter it by itself when the user leaves the app
 *    (Media Session "enterpictureinpicture", set up in call.ts).
 *  - Document picture-in-picture (desktop Chrome/Edge): an always-on-top window with the video,
 *    the call buttons and a small chat, rendered by CallPipWindow.
 * iOS does not document picture-in-picture for web calls in an installed app; where the browser
 * refuses, the in-app floating window (CallFloat) does the job.
 */

let video: HTMLVideoElement | null = null;

function hiddenVideo(): HTMLVideoElement {
  if (video) return video;
  video = document.createElement("video");
  video.muted = true; // the sound plays through the call's own audio element
  video.playsInline = true;
  video.autoplay = true;
  Object.assign(video.style, {
    position: "fixed",
    width: "2px",
    height: "2px",
    opacity: "0",
    pointerEvents: "none",
    bottom: "0",
    left: "0",
  });
  document.body.appendChild(video);
  return video;
}

// Keep the hidden video on the current remote stream.
useCall.subscribe((st) => {
  if (!video && !st.remoteStream) return;
  const v = hiddenVideo();
  if (v.srcObject !== st.remoteStream) {
    v.srcObject = st.remoteStream;
    if (st.remoteStream) v.play().catch(() => {});
  }
});

export const canSystemPip =
  typeof document !== "undefined" &&
  "pictureInPictureEnabled" in document &&
  (document as Document & { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled === true;

type DocPip = {
  requestWindow(o: { width: number; height: number }): Promise<Window>;
  window: Window | null;
};
const docPip = () =>
  (window as Window & { documentPictureInPicture?: DocPip }).documentPictureInPicture;
export const canDocPip = !!docPip() && !/Android|iPhone|iPad/.test(navigator.userAgent);

export const usePip = create<{ docWindow: Window | null; system: boolean }>(() => ({
  docWindow: null,
  system: false,
}));

export async function enterSystemPip(): Promise<boolean> {
  const st = useCall.getState();
  if (!canSystemPip || !st.remoteStream?.getVideoTracks().length) return false;
  const v = hiddenVideo();
  try {
    if (v.readyState < 1)
      await new Promise((r) => v.addEventListener("loadedmetadata", r, { once: true }));
    await v.play().catch(() => {});
    await v.requestPictureInPicture();
    usePip.setState({ system: true });
    v.addEventListener("leavepictureinpicture", () => usePip.setState({ system: false }), {
      once: true,
    });
    return true;
  } catch {
    return false;
  }
}

/** Opens the desktop always-on-top window; its content is portaled in by CallPipWindow. */
export async function openDocPip(): Promise<boolean> {
  const api = docPip();
  if (!api) return false;
  try {
    const w = await api.requestWindow({ width: 340, height: 480 });
    // Bring the app's styles along so the window looks like the app.
    for (const node of document.querySelectorAll('style, link[rel="stylesheet"]'))
      w.document.head.appendChild(node.cloneNode(true));
    w.document.documentElement.dir = document.documentElement.dir;
    w.document.documentElement.lang = document.documentElement.lang;
    w.document.documentElement.className = document.documentElement.className;
    w.document.documentElement.style.cssText = document.documentElement.style.cssText;
    w.document.body.className = "pip-body";
    w.addEventListener("pagehide", () => usePip.setState({ docWindow: null }));
    usePip.setState({ docWindow: w });
    return true;
  } catch {
    return false;
  }
}

export function closePips() {
  usePip.getState().docWindow?.close();
  usePip.setState({ docWindow: null });
  if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
}

// Leaving the app during a video call: try the system window (works where the browser allows it
// without a tap, e.g. Chrome with the video-conferencing auto picture-in-picture).
document.addEventListener("visibilitychange", () => {
  const st = useCall.getState();
  if (
    document.visibilityState === "hidden" &&
    st.phase === "active" &&
    st.video &&
    !usePip.getState().docWindow
  )
    enterSystemPip();
});
