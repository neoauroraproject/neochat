import { ApiClient } from "@neochat/sdk";

const baseUrl = import.meta.env.VITE_API_URL ?? "";

export const sdk = new ApiClient(baseUrl);

export function syncSdkToken(accessToken: string | null): void {
  sdk.setAccessToken(accessToken ?? undefined);
}
