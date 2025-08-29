import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Back-end on 3000; proxy avoids CORS during `npm run dev`
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:3000',
      '/students': 'http://localhost:3000',
      '/batches': 'http://localhost:3000',
      '/tickets': 'http://localhost:3000',
      '/reports': 'http://localhost:3000',
    }
  }
})
