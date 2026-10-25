# Plugin API

NeoChat exposes a plugin host stub in `@neochat/plugins`. External plugins are loaded by
`apps/api/src/plugin-loader` when packaged with a NeoChat-compatible manifest.

## Package layout

```
packages/plugins/src/
  capabilities.ts   # Capability enum (hooks, routes, etc.)
  manifest.ts       # PluginManifest interface
  lifecycle.ts      # Lifecycle states
  module.ts         # PluginModule interface
  host.ts           # PluginHost interface
  loader.ts         # Discovery/loading helpers
```

## Manifest

```typescript
import type { PluginManifest } from "@neochat/plugins";

export const manifest: PluginManifest = {
  id: "my-plugin",
  name: "My Plugin",
  version: "1.0.0",
  entry: "./dist/index.js",
  capabilities: ["admin-route", "config-category"],
  minHostVersion: "0.2.0-alpha",
};
```

## Lifecycle

Plugins move through states managed by `PluginHost`:

1. **registered** — manifest known to host
2. **loaded** — entry module imported
3. **activated** — hooks/routes registered
4. **deactivated** / **unloaded** — teardown

## Host context

```typescript
interface PluginHostContext {
  hostVersion: string;
  dataDir: string;
}
```

## Capabilities (Phase 2)

See `packages/plugins/src/capabilities.ts` for the current capability list. Phase 2 registers
plugins but does not expose production hook surfaces yet.

## Creating a plugin

1. Create a Node ESM package with `"neochat"` metadata in `package.json` (see plugin-loader)
2. Export a default module implementing `PluginModule`
3. Ship a `manifest` object matching `PluginManifest`
4. Install into the API plugins directory (future: admin-managed registry)

## API integration

- `PluginLoaderModule` is imported in `AppModule`
- Plugins must not bypass the Configuration Service or access message plaintext
- Admin-only capabilities require role checks on registered routes

## Related

- [`ARCHITECTURE.md`](ARCHITECTURE.md)
- [`CODING_STANDARDS.md`](CODING_STANDARDS.md)
