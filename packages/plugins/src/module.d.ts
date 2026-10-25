import type { PluginHost } from "./host.js";
export interface PluginModule {
  activate?(host: PluginHost): Promise<void> | void;
  deactivate?(): Promise<void> | void;
}
//# sourceMappingURL=module.d.ts.map
