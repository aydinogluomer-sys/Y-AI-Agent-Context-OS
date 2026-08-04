import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {fileURLToPath} from 'url';
import {defineConfig} from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': projectRoot,
        '@y/shared': path.resolve(projectRoot, 'packages/shared/src/index.ts'),
        '@y/core': path.resolve(projectRoot, 'packages/core/src/index.ts'),
        '@y/context': path.resolve(projectRoot, 'packages/context/src/index.ts'),
        '@y/graph': path.resolve(projectRoot, 'packages/graph/src/index.ts'),
        '@y/agents': path.resolve(projectRoot, 'packages/agents/src/index.ts'),
        '@y/connectors': path.resolve(projectRoot, 'packages/connectors/src/index.ts'),
        '@y/providers': path.resolve(projectRoot, 'packages/providers/src/index.ts'),
        '@y/security': path.resolve(projectRoot, 'packages/security/src/index.ts'),
        '@y/ui': path.resolve(projectRoot, 'packages/ui/src/index.ts'),
        '@y/web': path.resolve(projectRoot, 'apps/web/src'),
        '@y/api': path.resolve(projectRoot, 'apps/api/src'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('react') || id.includes('scheduler')) return 'react-vendor';
            if (id.includes('motion')) return 'motion-vendor';
            if (id.includes('lucide-react')) return 'icon-vendor';
            return 'vendor';
          },
        },
      },
    },
  };
});
