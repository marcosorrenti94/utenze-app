import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Base path per GitHub Pages.
 * - In GitHub Actions viene ricavato automaticamente dal nome del repository
 *   (https://<utente>.github.io/<nome-repo>/).
 * - Si può forzare con la variabile d'ambiente VITE_BASE (es. "/" per un dominio custom).
 * - In sviluppo locale è "/".
 */
function resolveBase(): string {
  if (process.env.VITE_BASE) return process.env.VITE_BASE;
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (process.env.GITHUB_ACTIONS && repo) {
    return repo.endsWith('.github.io') ? '/' : `/${repo}/`;
  }
  return '/';
}

export default defineConfig({
  base: resolveBase(),
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  optimizeDeps: {
    esbuildOptions: { target: 'es2022' },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
