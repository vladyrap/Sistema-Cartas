import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 127.0.0.1 explícito (NO 'localhost'): en Windows 'localhost' resuelve
      // primero a ::1 (IPv6) y uvicorn --host 127.0.0.1 solo escucha IPv4 →
      // el proxy fallaba con 500 (ECONNREFUSED) al reenviar el login.
      '/api/rt/ws': { target: 'ws://127.0.0.1:8000', ws: true, changeOrigin: true },
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Vendor splitting: librerías pesadas en chunks propios con cache estable.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Ecosistema three completo en un chunk (deps transitivas de fiber/drei
          // incluidas) — evita chunks circulares three↔vendor.
          if (/three|@react-three|react-reconciler|its-fine|zustand|suspend-react|maath|detect-gpu|troika|camera-controls|meshline|stats-gl|glsl|drei/.test(id)) {
            return 'vendor-three';
          }
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
          if (id.includes('react-router')) return 'vendor-router';
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'vendor-react';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (id.includes('axios')) return 'vendor-http';
          // Resto: dejar que Rollup decida (evita ciclos con un catch-all)
          return undefined;
        },
      },
    },
  },
});
