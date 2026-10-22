import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname),
  publicDir: resolve(import.meta.dirname, 'public'),
  build: { outDir: resolve(import.meta.dirname, '../portfolio-dist'), emptyOutDir: true },
});
