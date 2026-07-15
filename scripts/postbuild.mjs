// Portable (cross-platform) SPA fallback: copy the built index.html to 404.html
// so client-side route refreshes recover on GitHub Pages instead of 404'ing.
import { copyFileSync } from 'node:fs'

copyFileSync('dist/index.html', 'dist/404.html')
