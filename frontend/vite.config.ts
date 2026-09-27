import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En desarrollo (npm run dev) Vite reenvía /graphql al gateway, igual que
// Nginx en Docker: el navegador siempre habla con un único origen.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/graphql': 'http://127.0.0.1:4000' },
  },
});
