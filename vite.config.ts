import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  // Utiliser la racine du projet pour repérer index.html et src/client
  root: import.meta.dirname,
  publicDir: path.resolve(import.meta.dirname, 'public'),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/client'),
    emptyOutDir: true,
    manifest: true,
    cssMinify: 'esbuild',
  },
  server: {
    middlewareMode: true,
  },
})