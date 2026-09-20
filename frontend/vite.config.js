import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Configuration épurée : Le plugin PWA a été totalement supprimé.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  }
});
