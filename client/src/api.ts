import type { Media } from "./types";

const TOKEN_KEY = "neochat.token";

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: the session simply won't survive a reload */
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network", "network");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, data.error || "error", data.message || res.statusText);
  }
  return data as T;
}

export const get = <T>(path: string) => api<T>("GET", path);
export const post = <T>(path: string, body?: unknown) => api<T>("POST", path, body ?? {});
export const patch = <T>(path: string, body: unknown) => api<T>("PATCH", path, body);
export const put = <T>(path: string, body: unknown) => api<T>("PUT", path, body);
export const del = <T>(path: string) => api<T>("DELETE", path);

/** Upload with progress reporting (fetch has no upload progress). */
export function upload(
  file: Blob,
  opts: {
    name?: string;
    kind?: string;
    onProgress?: (p: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<Media> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media");
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: { error?: string; message?: string } & Partial<Media> = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as Media);
      else
        reject(
          new ApiError(xhr.status, data.error || "upload_failed", data.message || "upload failed"),
        );
    };
    xhr.onerror = () => reject(new ApiError(0, "network", "network"));
    xhr.onabort = () => reject(new ApiError(0, "aborted", "aborted"));
    opts.signal?.addEventListener("abort", () => xhr.abort());
    const form = new FormData();
    if (opts.kind) form.append("kind", opts.kind);
    form.append("file", file, opts.name || (file instanceof File ? file.name : "file"));
    xhr.send(form);
  });
}

export const mediaUrl = (id: string, thumb = false) =>
  id ? `/media/${id}${thumb ? "/thumb" : ""}` : "";
