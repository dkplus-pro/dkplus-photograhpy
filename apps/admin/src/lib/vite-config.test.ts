import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import type { ProxyOptions, UserConfig } from "vite";
import config, { resolveDevAdminToken } from "../../vite.config";

const apiProxy = (config as UserConfig).server?.proxy?.["/api"];
const uploadsProxy = (config as UserConfig).server?.proxy?.["/uploads"];

const originalViteAdminToken = process.env.VITE_ADMIN_TOKEN;
const originalAdminToken = process.env.ADMIN_TOKEN;

afterEach(() => {
  if (originalViteAdminToken === undefined) {
    delete process.env.VITE_ADMIN_TOKEN;
  } else {
    process.env.VITE_ADMIN_TOKEN = originalViteAdminToken;
  }

  if (originalAdminToken === undefined) {
    delete process.env.ADMIN_TOKEN;
  } else {
    process.env.ADMIN_TOKEN = originalAdminToken;
  }
});

function expectProxyOptions(value: unknown): asserts value is ProxyOptions {
  expect(value).toBeTypeOf("object");
  expect(value).not.toBeNull();
  expect(Array.isArray(value)).toBe(false);
}

describe("admin Vite API proxy", () => {
  it("forwards relative /api uploads to the Koa API server in local dev", () => {
    expectProxyOptions(apiProxy);
    expect(apiProxy.target).toBe(
      process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:4010",
    );
    expect(apiProxy.changeOrigin).toBe(true);
  });

  it("forwards local /uploads thumbnails to the same Koa server", () => {
    expectProxyOptions(uploadsProxy);
    expect(uploadsProxy.target).toBe(
      process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:4010",
    );
    expect(uploadsProxy.changeOrigin).toBe(true);
  });
});

describe("admin Vite token bootstrap", () => {
  it("prefers an explicit VITE_ADMIN_TOKEN", () => {
    process.env.VITE_ADMIN_TOKEN = " explicit-token ";
    process.env.ADMIN_TOKEN = "server-token";

    expect(resolveDevAdminToken("/missing/server/.env.local")).toBe(
      "explicit-token",
    );
  });

  it("falls back to ADMIN_TOKEN from the server env file for local dev", () => {
    delete process.env.VITE_ADMIN_TOKEN;
    delete process.env.ADMIN_TOKEN;
    const dir = mkdtempSync(join(tmpdir(), "dkplus-admin-vite-"));
    const envPath = join(dir, ".env.local");

    try {
      writeFileSync(
        envPath,
        ["# local server config", "ADMIN_TOKEN='server-file-token'"].join("\n"),
      );

      expect(resolveDevAdminToken(envPath)).toBe("server-file-token");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
