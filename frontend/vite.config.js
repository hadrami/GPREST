import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import mkcert from 'vite-plugin-mkcert';


// Expose dev server on LAN and proxy /api → backend
export default defineConfig({
  plugins: [react(), mkcert, tailwind()],
  server: {
    host: true,           // <— so your phone can open it via http://<PC-IP>:5173
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
