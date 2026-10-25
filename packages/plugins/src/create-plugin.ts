import type { PluginCapability } from "./capabilities.js";
import type { PluginManifest } from "./manifest.js";
import type { PluginModule } from "./module.js";

export type PluginPermission =
  | "messages.read"
  | "messages.write"
  | "config.read"
  | "config.write"
  | "storage.read"
  | "storage.write"
  | "admin.ui"
  | "health.probe"
  | "auth.hook";

export const PLUGIN_PERMISSIONS: ReadonlyArray<PluginPermission> = [
  "messages.read",
  "messages.write",
  "config.read",
  "config.write",
  "storage.read",
  "storage.write",
  "admin.ui",
  "health.probe",
  "auth.hook",
];

export interface CreatePluginOptions {
  manifest: Omit<PluginManifest, "capabilities"> & { capabilities?: PluginCapability[] };
  module: PluginModule;
}

export interface NeoChatPlugin {
  manifest: PluginManifest;
  module: PluginModule;
}

/**
 * Helper for plugin authors. Plugins run in-process with the API host;
 * sandboxing is advisory — only install plugins from trusted sources.
 */
export function createPlugin(options: CreatePluginOptions): NeoChatPlugin {
  const manifest: PluginManifest = {
    ...options.manifest,
    entry: options.manifest.entry ?? "dist/index.js",
    capabilities: options.manifest.capabilities ?? [],
  };
  return { manifest, module: options.module };
}
