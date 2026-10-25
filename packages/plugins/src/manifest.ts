import type { PluginCapability } from "./capabilities.js";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  entry: string;
  capabilities: PluginCapability[];
  minHostVersion?: string;
}

export interface PluginManifestFile {
  manifest: PluginManifest;
}
