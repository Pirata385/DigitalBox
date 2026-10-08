import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// base './' makes every built asset URL relative, so the site works from any
// GitHub Pages path (https://<user>.github.io/<repo>/) without configuration.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    passWithNoTests: true,
  },
});
