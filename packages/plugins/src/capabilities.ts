/** Capability tokens declared by a plugin manifest. */
export type PluginCapability =
  | "auth.hook"
  | "config.provider"
  | "health.probe"
  | "admin.page"
  | "storage.adapter"
  | "notification.adapter"
  | "search.adapter";

export const PLUGIN_CAPABILITIES: ReadonlyArray<PluginCapability> = [
  "auth.hook",
  "config.provider",
  "health.probe",
  "admin.page",
  "storage.adapter",
  "notification.adapter",
  "search.adapter",
];

export function isPluginCapability(value: string): value is PluginCapability {
  return (PLUGIN_CAPABILITIES as ReadonlyArray<string>).includes(value);
}
