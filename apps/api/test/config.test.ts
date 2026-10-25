import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultConfig, CONFIG_CATEGORIES } from "@neochat/config";

test("defaultConfig parses all categories", () => {
  const cfg = defaultConfig();
  for (const category of Object.keys(CONFIG_CATEGORIES)) {
    assert.ok(category in cfg, `missing category ${category}`);
    const parsed = CONFIG_CATEGORIES[category as keyof typeof CONFIG_CATEGORIES].safeParse(
      cfg[category as keyof typeof cfg],
    );
    assert.equal(parsed.success, true, `invalid defaults for ${category}`);
  }
});

test("backup category has schedule defaults", () => {
  const cfg = defaultConfig();
  assert.equal(cfg.backup.scheduleEnabled, false);
  assert.equal(cfg.backup.retentionCount, 14);
});

test("general maintenance mode defaults off", () => {
  const cfg = defaultConfig();
  assert.equal(cfg.general.maintenanceMode, false);
});
