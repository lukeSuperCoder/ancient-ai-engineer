import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../../', '');

  return {
    plugins: [react(), tailwindcss()],
    envDir: '../../',
    server: {
      proxy: {
        '/api/anthropic': {
          target: env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
        },
      },
    },
  };
});
