import { describe, expect, it } from "vitest";
import type { ProxyOptions, UserConfig } from "vite";
import config from "../../vite.config";

const apiProxy = (config as UserConfig).server?.proxy?.["/api"];
const uploadsProxy = (config as UserConfig).server?.proxy?.["/uploads"];

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
