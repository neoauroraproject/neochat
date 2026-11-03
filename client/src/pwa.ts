import { create } from "zustand";

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

const SEEN_KEY = "neochat.installSeen";

interface PwaState {
  /** Chrome/Edge/Android hand us this event when the app can be installed with one tap. */
  deferred: InstallEvent | null;
  guideOpen: boolean;
  openGuide(): void;
  closeGuide(): void;
  install(): Promise<boolean>;
}

export const usePwa = create<PwaState>((set, get) => ({
  deferred: null,
  guideOpen: false,
  openGuide: () => set({ guideOpen: true }),
  closeGuide: () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode */
    }
    set({ guideOpen: false });
  },
  async install() {
    const e = get().deferred;
    if (!e) return false;
    await e.prompt();
    const { outcome } = await e.userChoice;
    set({ deferred: null });
    return outcome === "accepted";
  },
}));

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  usePwa.setState({ deferred: e as InstallEvent });
});
window.addEventListener("appinstalled", () =>
  usePwa.setState({ deferred: null, guideOpen: false }),
);

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const ua = navigator.userAgent;
/** iPadOS reports itself as a Mac, so a touch screen gives it away. */
export const isIOS =
  /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
/** Chrome, Firefox, Edge and others on iOS add these tokens; plain Safari has none of them. */
export const isIOSSafari =
  isIOS && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|GSA\/|DuckDuckGo/.test(ua);

/** The guide is offered once per device, on the first sign-in, unless the app already runs installed. */
export function shouldOfferInstall(): boolean {
  if (isStandalone()) return false;
  try {
    return localStorage.getItem(SEEN_KEY) !== "1";
  } catch {
    return false;
  }
}
