import { test } from "node:test";
import assert from "node:assert/strict";
import { NoopCallProvider } from "@neochat/providers";

test("noop call provider health returns ok", async () => {
  const provider = new NoopCallProvider();
  const health = await provider.health();
  assert.equal(health.status, "ok");
  assert.equal(provider.name, "noop");
});

test("noop call provider issues placeholder token", async () => {
  const provider = new NoopCallProvider();
  const grant = await provider.createParticipantToken(
    { room: "test-room", identity: "user-1" },
    60,
  );
  assert.equal(grant.room, "test-room");
  assert.equal(grant.token, "noop");
});
