import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const packageJson = JSON.parse(
  readFileSync("./package.json", "utf-8")
);

// Codespaces forwards this HTTP server through an HTTPS URL. A local browser
// connects directly, so it must not be forced onto the proxy's port 443.
const codespaceName = process.env.CODESPACE_NAME?.trim();
const forwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN?.trim() || "app.github.dev";
const forwardedHost = codespaceName ? `${codespaceName}-5173.${forwardingDomain}` : undefined;

// The auto-passbook editor is Windows EXE only. Non-Windows bundles resolve
// its lazy imports to an inert placeholder instead of shipping heavy PDF/OCR
// editor modules into Android APK or public web JavaScript chunks.
export default defineConfig(({mode})=>{
  const nonWindowsLayout = mode==="web" || mode==="android" ||
    process.env.BANKSETU_BUILD_TARGET==="android";
  const unavailable=fileURLToPath(new URL("./src/platform/layoutUnavailable.tsx",import.meta.url));
  return {
  plugins: [react()],
  resolve: {
    alias: nonWindowsLayout ? [
      {find:/^\.\/CustomizeLayoutStudio$/,replacement:unavailable},
      {find:/^\.\/WorkspaceTemplateDocument$/,replacement:unavailable},
    ] : [],
  },

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
  };
});
