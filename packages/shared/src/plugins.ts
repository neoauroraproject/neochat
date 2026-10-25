import { z } from "zod";

export const PluginCapabilitySchema = z.enum([
  "auth.hook",
  "config.provider",
  "health.probe",
  "admin.page",
  "storage.adapter",
  "notification.adapter",
  "search.adapter",
]);
export type PluginCapability = z.infer<typeof PluginCapabilitySchema>;

export const PluginManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  author: z.string().optional(),
  homepage: z.string().optional(),
  entry: z.string(),
  capabilities: z.array(PluginCapabilitySchema),
  minHostVersion: z.string().optional(),
});
export type PluginManifestDto = z.infer<typeof PluginManifestSchema>;

export const PluginStateSchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
  manifest: PluginManifestSchema,
});
export type PluginStateDto = z.infer<typeof PluginStateSchema>;

export const PluginHostStatusSchema = z.object({
  ready: z.boolean(),
  hostVersion: z.string(),
  pluginCount: z.number().int().nonnegative(),
  plugins: z.array(PluginStateSchema),
});
export type PluginHostStatus = z.infer<typeof PluginHostStatusSchema>;

export const UpdatePluginStateRequestSchema = z.object({
  enabled: z.boolean(),
});
export type UpdatePluginStateRequest = z.infer<typeof UpdatePluginStateRequestSchema>;
