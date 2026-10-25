import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { PluginManifest } from "@neochat/plugins";
import { NoopPluginProvider, type PluginProvider } from "@neochat/providers";
import { PLUGIN_PROVIDER } from "../providers/provider.tokens.js";

export interface PluginHostSnapshot {
  ready: boolean;
  hostVersion: string;
  pluginCount: number;
  plugins: PluginManifest[];
}

const HOST_VERSION = "1.0.0-rc.1";

interface PackageJsonWithNeoChat {
  name?: string;
  neochat?: {
    manifest?: PluginManifest;
    plugin?: Partial<PluginManifest>;
  };
}

@Injectable()
export class PluginLoaderService implements OnModuleInit {
  private readonly logger = new Logger(PluginLoaderService.name);
  private snapshot: PluginHostSnapshot = {
    ready: false,
    hostVersion: HOST_VERSION,
    pluginCount: 0,
    plugins: [],
  };

  constructor(@Inject(PLUGIN_PROVIDER) private readonly plugins: PluginProvider) {}

  async onModuleInit(): Promise<void> {
    const discovered = await this.discoverManifests();
    this.snapshot = {
      ready: true,
      hostVersion: HOST_VERSION,
      pluginCount: discovered.length,
      plugins: discovered,
    };
    this.logger.log(`Plugin host ready (${discovered.length} plugins discovered)`);
  }

  getState(): PluginHostSnapshot {
    return this.snapshot;
  }

  private async discoverManifests(): Promise<PluginManifest[]> {
    if (this.plugins instanceof NoopPluginProvider) {
      return this.scanPluginDirectory();
    }
    return this.plugins.discover();
  }

  private scanPluginDirectory(): PluginManifest[] {
    const plugins: PluginManifest[] = [];
    const pluginsRoot = this.resolvePluginsRoot();
    if (!existsSync(pluginsRoot)) return plugins;

    for (const entry of readdirSync(pluginsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
      const manifest = this.readManifest(join(pluginsRoot, entry.name), entry.name);
      if (manifest) plugins.push(manifest);
    }
    return plugins;
  }

  private readManifest(rootPath: string, fallbackId: string): PluginManifest | null {
    const pkgPath = join(rootPath, "package.json");
    if (!existsSync(pkgPath)) return null;

    try {
      const raw = JSON.parse(readFileSync(pkgPath, "utf8")) as PackageJsonWithNeoChat;
      const manifest = raw.neochat?.manifest ?? raw.neochat?.plugin;
      if (!manifest?.id && !manifest?.name) return null;

      return {
        id: manifest.id ?? fallbackId,
        name: manifest.name ?? fallbackId,
        version: manifest.version ?? "0.0.0",
        description: manifest.description,
        author: manifest.author,
        homepage: manifest.homepage,
        entry: manifest.entry ?? "dist/index.js",
        capabilities: manifest.capabilities ?? [],
        minHostVersion: manifest.minHostVersion,
      };
    } catch (err) {
      this.logger.warn(`Failed to read plugin manifest at ${pkgPath}: ${String(err)}`);
      return null;
    }
  }

  private resolvePluginsRoot(): string {
    const here = dirname(fileURLToPath(import.meta.url));
    return resolve(here, "../../../../plugins");
  }
}
