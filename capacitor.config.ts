import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'in.banksetu.android',
  appName: 'Bank Setu',
  webDir: 'dist',
  // Bundled assets use the already trusted app origin. No remote server.url.
  server: { hostname: 'banksetu-app.web.app', androidScheme: 'https' },
  android: { allowMixedContent: false },
};
export default config;
