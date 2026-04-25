import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// PouchDB transitively imports node's `events` module. Vite's default browser
// build externalizes it to an empty stub, which makes `class X extends
// EventEmitter` blow up at runtime with "Class extends value [object Object]".
// Aliasing `events` to the npm shim of the same name fixes it.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      events: 'events',
    },
  },
  optimizeDeps: {
    include: ['events'],
  },
})
