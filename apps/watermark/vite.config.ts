import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function githubPagesBase() {
  const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];

  return process.env.GITHUB_ACTIONS === "true" && repositoryName
    ? `/${repositoryName}/watermark/`
    : "/";
}

export default defineConfig({
  base: githubPagesBase(),
  plugins: [react()],
});
