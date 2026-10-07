import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/*
 * GitHub Pages base path.
 *
 * The site is a GitHub Pages *project* page, so it is served from
 * https://<username>.github.io/<repository>/ — the base must match the repo
 * name, otherwise all assets 404 on the deployed site.
 *
 * The deploy workflow overrides this automatically with
 * `vite build --base=/<repo-name>/`, so you normally do not need to touch it.
 * Change it to '/' only if you deploy to a user/org page (username.github.io).
 */
export default defineConfig({
  base: '/KhazariumTracker/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    // The app ships as a single JS bundle; it is a small private site, so the
    // default 500 kB warning threshold is raised instead of code-splitting.
    chunkSizeWarningLimit: 900,
  },
})
