import type { PluginManifest } from "./manifest.js";
import type { PluginModule } from "./module.js";

export interface PluginLoader {
  resolveEntry(manifest: PluginManifest): string;
  importModule(entryPath: string): Promise<PluginModule>;
}

export interface PluginLoaderOptions {
  pluginsRoot: string;
}

export interface PluginLoaderContract {
  discover(root: string): Promise<PluginManifest[]>;
  load(manifest: PluginManifest, loader: PluginLoader): Promise<PluginModule>;
}
