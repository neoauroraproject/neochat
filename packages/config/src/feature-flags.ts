/** Canonical feature flag keys and their default state at bootstrap. */
export const DEFAULT_FEATURE_FLAGS: Record<string, boolean> = {
  "messaging.enabled": true,
  "messaging.groups": true,
  "messaging.channels": true,
  "messaging.reactions": true,
  "messaging.search": true,
  "calls.voice": false,
  "calls.video": false,
  "calls.screenShare": false,
  "plugins.host": true,
  "experimental.enabled": false,
  "ai.enabled": false,
  "admin.tlsWizard": true,
  "auth.rememberMe": false,
};

export type FeatureFlagKey = keyof typeof DEFAULT_FEATURE_FLAGS;
