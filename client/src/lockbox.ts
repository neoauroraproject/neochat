/**
 * Password-locked messages. The text (or photo) is encrypted on this phone with AES-GCM under a
 * key derived from the password (PBKDF2-SHA-256, 250 000 rounds, random salt). The server and
 * the admin only ever see the envelope below; the password never leaves the phone, so the lock
 * is as strong as the password — very simple ones are refused.
 *
 * Envelope (the message text): {"v":1,"salt","iv","ct","hint"}; ct decrypts to
 *   {"t":"text","text":"..."} or {"t":"file","mime","name","iv"} — the file itself is uploaded
 *   encrypted with the same key and that second iv.
 */
const ROUNDS = 250_000;

const b64 = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function keyFor(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: ROUNDS },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

const COMMON = new Set([
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1234567890",
  "password",
  "qwerty",
  "111111",
  "000000",
  "abc123",
  "123123",
  "654321",
  "112233",
  "121212",
  "iloveyou",
  "admin",
  "letmein",
  "qwerty123",
  "1q2w3e",
  "1q2w3e4r",
  "asdfgh",
  "zxcvbn",
  "666666",
  "888888",
  "987654321",
]);

/** Too short, a single repeated character, a straight run (1234, abcd) or a well-known one. */
export function weakPassword(p: string): boolean {
  const s = p.trim().toLowerCase();
  if (s.length < 6 || COMMON.has(s)) return true;
  if (new Set(s).size <= 2) return true;
  let up = true;
  let down = true;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    if (d !== 1) up = false;
    if (d !== -1) down = false;
  }
  return up || down;
}

export async function lockText(text: string, password: string, hint: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(password, salt);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify({ t: "text", text })),
  );
  return JSON.stringify({
    v: 1,
    salt: b64(salt),
    iv: b64(iv),
    ct: b64(ct),
    hint: hint.trim().slice(0, 80),
  });
}

export async function lockFile(
  file: File,
  password: string,
  hint: string,
): Promise<{ envelope: string; blob: Blob }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const fileIv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(password, salt);
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: fileIv },
    key,
    await file.arrayBuffer(),
  );
  const head = {
    t: "file",
    mime: file.type || "application/octet-stream",
    name: file.name,
    iv: b64(fileIv),
  };
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(head)),
  );
  return {
    envelope: JSON.stringify({
      v: 1,
      salt: b64(salt),
      iv: b64(iv),
      ct: b64(ct),
      hint: hint.trim().slice(0, 80),
    }),
    blob: new Blob([data], { type: "application/octet-stream" }),
  };
}

export function lockHint(envelope: string): string {
  try {
    return (JSON.parse(envelope).hint as string) || "";
  } catch {
    return "";
  }
}

export type Unlocked =
  { t: "text"; text: string } | { t: "file"; url: string; mime: string; name: string };

/** Opens a locked message; throws on a wrong password. `fileUrl` is the encrypted upload. */
export async function unlock(
  envelope: string,
  password: string,
  fileUrl?: string,
): Promise<Unlocked> {
  const box = JSON.parse(envelope) as { salt: string; iv: string; ct: string };
  const key = await keyFor(password, unb64(box.salt));
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(box.iv) },
    key,
    unb64(box.ct),
  );
  const head = JSON.parse(new TextDecoder().decode(plain)) as
    { t: "text"; text: string } | { t: "file"; mime: string; name: string; iv: string };
  if (head.t === "text") return head;
  if (!fileUrl) throw new Error("missing file");
  const enc = await (await fetch(fileUrl)).arrayBuffer();
  const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(head.iv) }, key, enc);
  return {
    t: "file",
    mime: head.mime,
    name: head.name,
    url: URL.createObjectURL(new Blob([data], { type: head.mime })),
  };
}
