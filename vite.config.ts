import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/*
 * Relative base path.
 *
 * Using './' makes every asset reference relative, so the same build works no
 * matter where GitHub Pages serves it from:
 *   - a user/org page at the domain root   (https://<user>.github.io/)
 *   - a project page in a sub-path          (https://<user>.github.io/<repo>/)
 *
 * This removes any dependence on the repository name. The deploy workflow does
 * not override it.
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    // The app ships as a single JS bundle; it is a small private site, so the
    // default 500 kB warning threshold is raised instead of code-splitting.
    chunkSizeWarningLimit: 900,
  },
})
