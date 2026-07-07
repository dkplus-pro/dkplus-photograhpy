import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxyTarget =
  process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:4010";

export default defineConfig({
  plugins: [react()],
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
