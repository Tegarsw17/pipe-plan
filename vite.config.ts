import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Satu file HTML: bisa dibuka langsung dari folder (file://) tanpa server.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
