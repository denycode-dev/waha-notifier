import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  safeText,
  safeCompare,
  formatMessage,
  EVENT_LABELS,
  loadConfig,
  type CoolifyWebhookPayload,
} from "./server.js";

describe("Coolify to WAHA bridge logic", () => {
  test("safeText strips non-printable control characters and respects max length", () => {
    const raw = "Hello\u0000World\u0007!";
    assert.equal(safeText(raw), "HelloWorld!");

    const longText = "a".repeat(20);
    assert.equal(safeText(longText, 5), "aaaaa");
    assert.equal(safeText(null), "");
    assert.equal(safeText(123), "");
  });

  test("safeCompare correctly performs constant-time equality check", () => {
    assert.equal(safeCompare("/hook/secret123", "/hook/secret123"), true);
    assert.equal(safeCompare("/hook/secret123", "/hook/secret456"), false);
    assert.equal(safeCompare("/hook/short", "/hook/muchlongersecret"), false);
  });

  test("formatMessage formats known Coolify event with details", () => {
    const payload: CoolifyWebhookPayload = {
      event: "deployment_success",
      message: "Build completed successfully",
      application_name: "my-web-app",
      container_name: "web-app-1",
      server_name: "prod-vps",
      status: "running",
      url: "https://coolify.example.com/app/1",
    };

    const formatted = formatMessage(payload);

    assert.ok(formatted.includes(`🔔 ${EVENT_LABELS["deployment_success"]}`));
    assert.ok(formatted.includes("Build completed successfully"));
    assert.ok(formatted.includes("Aplikasi: my-web-app"));
    assert.ok(formatted.includes("Container: web-app-1"));
    assert.ok(formatted.includes("Server: prod-vps"));
    assert.ok(formatted.includes("Status: running"));
    assert.ok(formatted.includes("Dashboard: https://coolify.example.com/app/1"));
    assert.ok(formatted.includes("Event: deployment_success"));
  });

  test("loadConfig validates required environment variables", () => {
    const originalEnv = { ...process.env };

    delete process.env["WEBHOOK_SECRET"];
    assert.throws(() => loadConfig(), {
      message: /Missing required environment variable/,
    });

    // Restore
    process.env = originalEnv;
  });
});
