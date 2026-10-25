export const PLUGIN_CAPABILITIES = [
  "auth.hook",
  "config.provider",
  "health.probe",
  "admin.page",
  "storage.adapter",
  "notification.adapter",
  "search.adapter",
];
export function isPluginCapability(value) {
  return PLUGIN_CAPABILITIES.includes(value);
}
//# sourceMappingURL=capabilities.js.map
