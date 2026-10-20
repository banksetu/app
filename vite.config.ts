import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync("./package.json", "utf-8")
);

// Codespaces forwards this HTTP server through an HTTPS URL. A local browser
// connects directly, so it must not be forced onto the proxy's port 443.
const codespaceName = process.env.CODESPACE_NAME?.trim();
const forwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN?.trim() || "app.github.dev";
const forwardedHost = codespaceName ? `${codespaceName}-5173.${forwardingDomain}` : undefined;

export default defineConfig({
  plugins: [react()],

  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },

  server: {
    host: forwardedHost ? "0.0.0.0" : "127.0.0.1",
    port: 5173,
    strictPort: true,
    allowedHosts: forwardedHost ? [forwardedHost] : [],
    hmr: forwardedHost ? { protocol: "wss", host: forwardedHost, clientPort: 443 } : undefined,

    watch: {
      usePolling: true,
      interval: 300,
    },
  },
});
