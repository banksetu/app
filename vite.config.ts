import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync("./package.json", "utf-8")
);

export default defineConfig({
  plugins: [react()],

  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },

  server: {
    host: true,
    port: 5173,
    strictPort: true,

    hmr: {
      clientPort: 443,
    },

    watch: {
      usePolling: true,
      interval: 300,
    },
  },
});