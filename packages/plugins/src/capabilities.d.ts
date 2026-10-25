/** Capability tokens declared by a plugin manifest. */
export type PluginCapability =
  | "auth.hook"
  | "config.provider"
  | "health.probe"
  | "admin.page"
  | "storage.adapter"
  | "notification.adapter"
  | "search.adapter";
export declare const PLUGIN_CAPABILITIES: ReadonlyArray<PluginCapability>;
export declare function isPluginCapability(value: string): value is PluginCapability;
//# sourceMappingURL=capabilities.d.ts.map
