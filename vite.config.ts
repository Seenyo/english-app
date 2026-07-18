import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Derive the base path from the CI repo name so assets resolve under
// https://<user>.github.io/<repo>/. Locally (no GITHUB_REPOSITORY) -> "/".
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];

export default defineConfig({
  base: repo ? `/${repo}/` : '/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  plugins: [react(), tailwindcss()],
});
