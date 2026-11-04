import { create } from "zustand";

/**
 * App lock: after the app has been away for a while it asks for a 4- or 6-digit code, or Face ID
 * / a fingerprint (WebAuthn with the phone's own authenticator). While the app is in the
 * background its content is blurred, so the app switcher's snapshot shows nothing.
 * The code is stored only as a salted PBKDF2 hash on this device.
 */
interface LockConfig {
  salt: string;
  hash: string;
  digits: 4 | 6;
  afterMin: number; // 0 = every time the app is left
  credId?: string; // WebAuthn credential for biometrics
}

const KEY = "neochat.applock";
const enc = new TextEncoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function read(): LockConfig | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}
function write(c: LockConfig | null) {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

async function hashPin(pin: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: 150_000 },
    base,
    256,
  );
  return b64(new Uint8Array(bits));
}

export const useAppLock = create<{
  config: LockConfig | null;
  locked: boolean;
  /** Wrong codes in a row, and until when entry is paused after too many. */
  fails: number;
  pausedUntil: number;
}>(() => {
  const config = read();
  return { config, locked: !!config, fails: 0, pausedUntil: 0 };
});

export async function enableLock(pin: string, digits: 4 | 6, afterMin: number) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prev = useAppLock.getState().config;
  const config: LockConfig = {
    salt: b64(salt),
    hash: await hashPin(pin, salt),
    digits,
    afterMin,
    credId: prev?.credId,
  };
  write(config);
  useAppLock.setState({ config, locked: false });
}

export function disableLock() {
  write(null);
  useAppLock.setState({ config: null, locked: false });
}

export function setLockAfter(afterMin: number) {
  const c = useAppLock.getState().config;
  if (!c) return;
  const config = { ...c, afterMin };
  write(config);
  useAppLock.setState({ config });
}

export async function tryPin(pin: string): Promise<boolean> {
  const st = useAppLock.getState();
  if (!st.config || Date.now() < st.pausedUntil) return false;
  const ok = (await hashPin(pin, unb64(st.config.salt))) === st.config.hash;
  if (ok) useAppLock.setState({ locked: false, fails: 0 });
  else {
    const fails = st.fails + 1;
    // Five wrong codes pause entry for 30 s, doubling each further time.
    const pausedUntil = fails >= 5 ? Date.now() + 30_000 * 2 ** (fails - 5) : 0;
    useAppLock.setState({ fails, pausedUntil });
  }
  return ok;
}

// --- biometrics (Face ID / fingerprint) ---------------------------------------------------------

/** WebAuthn needs a domain name (not an IP address) and a platform authenticator. */
export async function biometricsAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential || /^[\d.:[\]]+$/.test(location.hostname)) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function enableBiometrics(userName: string): Promise<boolean> {
  const c = useAppLock.getState().config;
  if (!c) return false;
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: document.title || "NeoChat", id: location.hostname },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: userName,
          displayName: userName,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "discouraged",
        },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return false;
    const config = { ...c, credId: b64(new Uint8Array(cred.rawId)) };
    write(config);
    useAppLock.setState({ config });
    return true;
  } catch {
    return false;
  }
}

export function disableBiometrics() {
  const c = useAppLock.getState().config;
  if (!c) return;
  const config = { ...c, credId: undefined };
  write(config);
  useAppLock.setState({ config });
}

export async function unlockWithBiometrics(): Promise<boolean> {
  const c = useAppLock.getState().config;
  if (!c?.credId) return false;
  try {
    const got = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: "public-key", id: unb64(c.credId) }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    if (got) useAppLock.setState({ locked: false, fails: 0 });
    return !!got;
  } catch {
    return false;
  }
}

// --- when to lock --------------------------------------------------------------------------------

let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  const root = document.documentElement;
  if (document.visibilityState === "hidden") {
    hiddenAt = Date.now();
    if (useAppLock.getState().config) root.classList.add("privacy-blur");
    return;
  }
  root.classList.remove("privacy-blur");
  const c = useAppLock.getState().config;
  if (c && hiddenAt && Date.now() - hiddenAt >= c.afterMin * 60_000)
    useAppLock.setState({ locked: true });
  hiddenAt = 0;
});
// The page losing focus to the app switcher (iOS fires this before the snapshot).
window.addEventListener("pagehide", () => {
  if (useAppLock.getState().config) document.documentElement.classList.add("privacy-blur");
});
window.addEventListener("pageshow", () =>
  document.documentElement.classList.remove("privacy-blur"),
);
