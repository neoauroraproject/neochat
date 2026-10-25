# NeoChat Plugin Development

NeoChat **1.0.0-rc.1** ships a plugin SDK in `@neochat/plugins` for in-process extensions.

## Quick start

```typescript
import { createPlugin } from "@neochat/plugins";

export default createPlugin({
  manifest: {
    id: "my-plugin",
    name: "My Plugin",
    version: "1.0.0",
    entry: "dist/index.js",
    capabilities: ["health.probe"],
  },
  module: {
    async activate() {
      console.log("activated");
    },
  },
});
```

Add to `plugins/my-plugin/package.json`:

```json
{
  "neochat": {
    "manifest": {
      "id": "my-plugin",
      "name": "My Plugin",
      "version": "1.0.0",
      "capabilities": ["admin.page"]
    }
  }
}
```

## Capabilities

| Capability             | Purpose                      |
| ---------------------- | ---------------------------- |
| `auth.hook`            | Extend authentication flows  |
| `config.provider`      | Supply dynamic configuration |
| `health.probe`         | Register health checks       |
| `admin.page`           | Admin UI extensions          |
| `storage.adapter`      | Custom storage backends      |
| `notification.adapter` | Push/notification providers  |
| `search.adapter`       | Search backends              |

## Permissions

Plugins declare capabilities; the host maps them to permission tokens (`messages.read`, `config.write`, etc.). Only install plugins from trusted sources — **plugins run in-process without a hard sandbox**.

## Admin API

- `GET /api/v1/admin/plugins` — list discovered plugins and enable state
- `PATCH /api/v1/admin/plugins/:id` — enable/disable via config

## Host version

Plugins may specify `minHostVersion` in their manifest. The current host version is **1.0.0-rc.1**.
