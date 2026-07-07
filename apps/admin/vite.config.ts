import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxyTarget =
  process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:4010";

const serverEnvPath = fileURLToPath(
  new URL("../server/.env.local", import.meta.url),
);

function normalizeEnvValue(raw: string): string | undefined {
  let value = raw.trim();
  const quote = value[0];
  if (
    value.length >= 2 &&
    (quote === '"' || quote === "'") &&
    value[value.length - 1] === quote
  ) {
    value = value.slice(1, -1);
  }
  return value.trim() || undefined;
}

function readAdminTokenFromEnvFile(envPath: string): string | undefined {
  if (!existsSync(envPath)) return undefined;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match || match[1] !== "ADMIN_TOKEN") continue;
    return normalizeEnvValue(match[2]);
  }

  return undefined;
}

export function resolveDevAdminToken(
  envPath = serverEnvPath,
): string | undefined {
  const explicitViteToken = process.env.VITE_ADMIN_TOKEN?.trim();
  if (explicitViteToken) return explicitViteToken;

  const sharedProcessToken = process.env.ADMIN_TOKEN?.trim();
  if (sharedProcessToken) return sharedProcessToken;

  return readAdminTokenFromEnvFile(envPath);
}

// Local admin and Koa server are often run side-by-side with only
// apps/server/.env.local configured. Mirror that ADMIN_TOKEN into Vite's
// public admin token at dev/build time without logging or committing secrets.
const shouldBootstrapDevToken = process.env.VITEST !== "true";
const devAdminToken = shouldBootstrapDevToken
  ? resolveDevAdminToken()
  : undefined;
if (devAdminToken && !process.env.VITE_ADMIN_TOKEN) {
  process.env.VITE_ADMIN_TOKEN = devAdminToken;
}

export default defineConfig({
  plugins: [react()],
  define: devAdminToken
    ? {
        "import.meta.env.VITE_ADMIN_TOKEN": JSON.stringify(devAdminToken),
      }
    : undefined,
  server: {
    port: 5174,
    proxy: {
      // The admin client defaults to relative /api requests. Proxying keeps
      // /api/uploads on the Koa server instead of letting Vite return a 404.
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      // Local upload records may resolve to /uploads/... when PUBLIC_BASE_URL
      // is omitted. Proxy that path too so table thumbnails hit Koa's static
      // upload reader instead of Vite's 404 handler.
      "/uploads": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4174,
  },
});
