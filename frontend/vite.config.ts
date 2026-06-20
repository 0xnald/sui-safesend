import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/sui-prover': {
          target: 'https://api.us1.shinami.com/sui/zkprover',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/sui-prover/, '/v1'),
          headers: {
            'X-Api-Key': env.VITE_SHINAMI_API_KEY || ''
          },
          secure: false,
        }
      }
    }
  };
})
