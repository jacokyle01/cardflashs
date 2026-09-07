import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// PouchDB transitively imports node's `events` module. Vite's default browser
// build externalizes it to an empty stub, which makes `class X extends
// EventEmitter` blow up at runtime with "Class extends value [object Object]".
// Aliasing `events` to the npm shim of the same name fixes it.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // In production the token-exchange functions are served by Cloudflare
  // Pages on the same origin at /api/*. In dev, `npm run functions` runs
  // them with wrangler on :8788 and we proxy so the app can still use
  // relative URLs.
  server: {
    proxy: {
      '/api': 'http://localhost:8788',
    },
  },
  resolve: {
    alias: {
      events: 'events',
    },
  },
  optimizeDeps: {
    include: ['events'],
  },
})
