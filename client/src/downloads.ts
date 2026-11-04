import { create } from "zustand";
import { mediaUrl } from "./api";
import { useSheet } from "./components/sheet";
import { translate } from "./i18n";
import { isIOS } from "./pwa";
import { useApp } from "./store";
import type { Media } from "./types";

/**
 * Every download button goes through here. The app never navigates to a file's address (in the
 * installed iOS app that opens a page with no way back, WebKit bug 236943). Instead the file is
 * fetched inside the app with progress, then saved the way the device saves things:
 *  - iOS: the share sheet with the file itself (Save Image / Save Video / Save to Files);
 *  - Android and desktop: a normal download with the original name.
 * Fetches go through the service worker, so a downloaded file also stays in the media cache.
 */
export type DownloadState = "loading" | "done" | "error";

interface Job {
  state: DownloadState;
  progress: number; // 0..1
  blob?: Blob;
  abort?: AbortController;
}

interface DownloadStore {
  jobs: Record<string, Job>;
}

export const useDownloads = create<DownloadStore>(() => ({ jobs: {} }));

/** Above this, Android and desktop hand the file to the browser's own download manager. */
const DIRECT_BYTES = 40 << 20;
/** Finished downloads kept in memory for an instant second save; older ones are dropped. */
const KEEP_BLOBS = 6;

const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) =>
  translate(useApp.getState().lang, k, v);

function setJob(id: string, patch: Partial<Job> | null) {
  useDownloads.setState((s) => {
    const jobs = { ...s.jobs };
    if (patch === null) delete jobs[id];
    else jobs[id] = { ...(jobs[id] || { state: "loading", progress: 0 }), ...patch };
    // Keep memory bounded: only the most recent finished blobs stay.
    const done = Object.keys(jobs).filter((k) => jobs[k].blob);
    for (const k of done.slice(0, Math.max(0, done.length - KEEP_BLOBS)))
      jobs[k] = { ...jobs[k], blob: undefined };
    return { jobs };
  });
}

function fileName(m: Media) {
  if (m.name) return m.name;
  const ext = m.mime.split("/")[1]?.split(/[+;]/)[0] || "bin";
  return `${m.kind}-${m.id.slice(0, 8)}.${ext}`;
}

/** Hands a finished file to the system. Must run inside a tap on iOS (share needs a gesture). */
export async function saveFile(m: Media): Promise<void> {
  const blob = useDownloads.getState().jobs[m.id]?.blob;
  if (!blob) {
    startDownload(m);
    return;
  }
  const name = fileName(m);
  if (isIOS) {
    const file = new File([blob], name, { type: m.mime || blob.type });
    const nav = navigator as Navigator & { canShare?(d: ShareData): boolean };
    if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
      try {
        await nav.share({ files: [file] });
        return;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return; // the user closed the sheet
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** On iOS the share sheet needs a fresh tap, so a finished download asks for one. */
function offerSave(m: Media) {
  useSheet.getState().ask({
    title: fileName(m),
    message: t("dl.ready"),
    actions: [{ label: t("dl.save"), danger: false, run: () => saveFile(m) }],
  });
}

/** Starts (or, when already downloaded, saves) a file. `silent` skips the save step afterwards. */
export function startDownload(m: Media, opts: { silent?: boolean } = {}) {
  if (!m.id) return;
  const job = useDownloads.getState().jobs[m.id];
  if (job?.state === "loading") return;
  if (job?.state === "done" && job.blob) {
    if (!opts.silent) (isIOS ? offerSave : saveFile)(m);
    return;
  }
  // Big files on Android/desktop: the browser downloads them to disk without holding them in memory.
  if (!isIOS && m.size > DIRECT_BYTES && !opts.silent) {
    const a = document.createElement("a");
    a.href = `${mediaUrl(m.id)}?dl=1`;
    a.download = fileName(m);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setJob(m.id, { state: "done", progress: 1 });
    useApp.getState().toast(t("dl.started"));
    return;
  }
  const abort = new AbortController();
  setJob(m.id, { state: "loading", progress: 0, abort });
  fetchWithProgress(m, abort.signal)
    .then((blob) => {
      setJob(m.id, { state: "done", progress: 1, blob, abort: undefined });
      if (opts.silent) return;
      if (isIOS) offerSave(m);
      else saveFile(m);
    })
    .catch((e) => {
      if ((e as DOMException)?.name === "AbortError") {
        setJob(m.id, null);
        return;
      }
      setJob(m.id, { state: "error", abort: undefined });
      useApp.getState().toast(t("dl.failed"), "error");
    });
}

export function cancelDownload(id: string) {
  useDownloads.getState().jobs[id]?.abort?.abort();
}

async function fetchWithProgress(m: Media, signal: AbortSignal): Promise<Blob> {
  const res = await fetch(mediaUrl(m.id), { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length")) || m.size || 0;
  if (!res.body || !total) return res.blob();
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  let shown = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    const p = Math.min(1, got / total);
    if (p - shown > 0.02 || p === 1) {
      shown = p;
      setJob(m.id, { progress: p });
    }
  }
  return new Blob(parts as BlobPart[], { type: m.mime || res.headers.get("content-type") || "" });
}

/** State of one file's download for buttons and progress rings. */
export function useDownload(id?: string) {
  return useDownloads((s) => (id ? s.jobs[id] : undefined));
}
