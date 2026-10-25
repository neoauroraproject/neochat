export type PluginLifecycle =
  "unloaded" | "loading" | "loaded" | "activating" | "active" | "deactivating" | "error";

export interface PluginLifecycleState {
  pluginId: string;
  lifecycle: PluginLifecycle;
  error?: string;
  updatedAt: Date;
}
