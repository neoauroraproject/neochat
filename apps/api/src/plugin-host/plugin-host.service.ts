import { Injectable, NotFoundException } from "@nestjs/common";
import type { PluginHostStatus, UpdatePluginStateRequest } from "@neochat/shared";
import { type AuditService } from "../audit/audit.service.js";
import { type ConfigurationService } from "../config/configuration.service.js";
import { type PluginLoaderService } from "../plugin-loader/plugin-loader.service.js";
import { APP_VERSION } from "../system/system.service.js";

@Injectable()
export class PluginHostService {
  constructor(
    private readonly loader: PluginLoaderService,
    private readonly cfg: ConfigurationService,
    private readonly audit: AuditService,
  ) {}

  status(): PluginHostStatus {
    const state = this.loader.getState();
    const disabled = this.cfg.get("general").disabledPlugins ?? [];
    const disabledSet = new Set(disabled);
    return {
      ready: state.ready,
      hostVersion: APP_VERSION,
      pluginCount: state.pluginCount,
      plugins: state.plugins.map((manifest) => ({
        id: manifest.id,
        enabled: !disabledSet.has(manifest.id),
        manifest,
      })),
    };
  }

  async setEnabled(pluginId: string, body: UpdatePluginStateRequest, actorId: string, ip?: string) {
    const state = this.loader.getState();
    if (!state.plugins.some((p) => p.id === pluginId)) {
      throw new NotFoundException(`Plugin '${pluginId}' not found`);
    }
    const disabled = new Set(this.cfg.get("general").disabledPlugins ?? []);
    if (body.enabled) disabled.delete(pluginId);
    else disabled.add(pluginId);
    await this.cfg.set("general", "disabledPlugins", [...disabled]);
    await this.audit.record({
      actorId,
      action: body.enabled ? "admin.plugin.enable" : "admin.plugin.disable",
      targetType: "plugin",
      targetId: pluginId,
      ip,
    });
    return this.status();
  }
}
