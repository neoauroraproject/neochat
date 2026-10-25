import type { PluginManifest, PluginModule } from "@neochat/plugins";

export interface PluginLoadResult {
  manifest: PluginManifest;
  module: PluginModule;
}

/** Abstraction over plugin discovery and module loading. */
export interface PluginProvider {
  readonly name: string;
  discover(): Promise<PluginManifest[]>;
  load(manifest: PluginManifest): Promise<PluginLoadResult>;
  unload(pluginId: string): Promise<void>;
}

/** Phase 2 noop adapter — plugin host stub; discovery returns empty. */
export class NoopPluginProvider implements PluginProvider {
  readonly name = "noop";

  async discover(): Promise<PluginManifest[]> {
    return [];
  }

  async load(manifest: PluginManifest): Promise<PluginLoadResult> {
    return {
      manifest,
      module: {
        activate: async () => {},
        deactivate: async () => {},
      },
    };
  }

  async unload(_pluginId: string): Promise<void> {}
}
