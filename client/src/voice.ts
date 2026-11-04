// Microphone and format helpers for voice messages.
//
// - The microphone stream is kept for a short while after a recording, so a second voice message
//   right after the first does not ask for permission again (the installed iOS app asks on every
//   new request). It is released before any playback, because while the microphone is open iOS
//   plays sound quietly through the earpiece.
// - Recordings use AAC in MP4 when the browser can make it: every phone and browser plays that.
//   Opus (WebM/Ogg) is the fallback.

let stream: MediaStream | null = null;
let releaseTimer = 0;

const KEEP_MS = 20_000;

function live(s: MediaStream | null): s is MediaStream {
  return !!s && s.getAudioTracks().some((t) => t.readyState === "live");
}

export async function getMic(): Promise<MediaStream> {
  window.clearTimeout(releaseTimer);
  if (live(stream)) {
    stream.getAudioTracks().forEach((t) => (t.enabled = true));
    return stream;
  }
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  return stream;
}

/** Keeps the microphone a little longer for the next message, then lets it go. */
export function releaseMicSoon() {
  window.clearTimeout(releaseTimer);
  stream?.getAudioTracks().forEach((t) => (t.enabled = false));
  releaseTimer = window.setTimeout(releaseMic, KEEP_MS);
}

export function releaseMic() {
  window.clearTimeout(releaseTimer);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") releaseMic();
});

const FORMATS = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/webm",
];

export function recorderFormat(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return FORMATS.find((m) => MediaRecorder.isTypeSupported(m)) || "";
}

export function extensionFor(type: string): string {
  return type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
}

/** Whether this browser can play a voice message of the given type ("" when unknown). */
export function canPlay(type: string): boolean {
  if (!type) return true;
  const a = document.createElement("audio");
  const base = type.split(";")[0];
  return !!(a.canPlayType(type) || a.canPlayType(base));
}
