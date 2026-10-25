export interface ApiClientOptions {
  accessToken?: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

export interface RequestOptions {
  accessToken?: string;
  signal?: AbortSignal;
}
