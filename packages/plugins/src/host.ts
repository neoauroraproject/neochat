import type { PluginLifecycleState } from "./lifecycle.js";
import type { PluginManifest } from "./manifest.js";
import type { PluginModule } from "./module.js";

export interface PluginHostContext {
  hostVersion: string;
  dataDir: string;
}

export interface PluginHost {
  readonly context: PluginHostContext;
  register(manifest: PluginManifest): Promise<void>;
  load(pluginId: string): Promise<PluginModule>;
  activate(pluginId: string): Promise<void>;
  deactivate(pluginId: string): Promise<void>;
  unload(pluginId: string): Promise<void>;
  getLifecycle(pluginId: string): PluginLifecycleState;
  list(): PluginManifest[];
}
