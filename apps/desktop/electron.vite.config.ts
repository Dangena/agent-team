import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const workspacePackages = [
  "@agent-team/agent-host",
  "@agent-team/agent-team-core",
  "@agent-team/cli-adapters",
  "@agent-team/platform",
  "@agent-team/persistence",
  "@agent-team/protocol"
];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: { rollupOptions: { input: resolve(__dirname, "src/main/main.ts") } }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/preload/index.ts"),
        output: { format: "cjs", entryFileNames: "index.cjs" }
      }
    }
  },
  renderer: {
    root: __dirname,
    plugins: [react()],
    build: { rollupOptions: { input: resolve(__dirname, "index.html") } }
  }
});
