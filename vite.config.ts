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
        '@y/db': path.resolve(projectRoot, 'packages/db/src/index.ts'),
        '@y/core': path.resolve(projectRoot, 'packages/core/src/index.ts'),
        '@y/context/': path.resolve(projectRoot, 'packages/context/src') + '/',
      '@y/context': path.resolve(projectRoot, 'packages/context/src/index.ts'),
        '@y/agents': path.resolve(projectRoot, 'packages/agents/src/index.ts'),
        '@y/providers': path.resolve(projectRoot, 'packages/providers/src/index.ts'),
        // Subpath alias, tam eslesmeden ONCE gelmeli.
        '@y/graph/': path.resolve(projectRoot, 'packages/graph/src') + '/',
        '@y/graph': path.resolve(projectRoot, 'packages/graph/src/index.ts'),
        '@y/adapters': path.resolve(projectRoot, 'packages/adapters/src/index.ts'),
        '@y/observability': path.resolve(projectRoot, 'packages/observability/src/index.ts'),
        '@y/security/': path.resolve(projectRoot, 'packages/security/src') + '/',
        '@y/security': path.resolve(projectRoot, 'packages/security/src/index.ts'),
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
          /*
           * PAKET SINIRINDA eslestir, alt dize arama.
           *
           * Onceki hali `id.includes('react')` kullaniyordu ve
           * `lucide-react` kurali HIC CALISMIYORDU: 'react' alt dizesi
           * ondan once eslesiyordu, `icon-vendor` chunk'i uretilmiyordu
           * bile. Duzeltmeden sonra chunk ortaya cikti.
           *
           * NOT: bu duzeltme uretim paketindeki
           * "Cannot read properties of null (reading 'useState')"
           * hatasini COZMEDI. Chunk'lari tamamen kaldirip tek bundle
           * uretmek de cozmedi — yani sebep chunk bolmesi DEGIL.
           * Kalan kusur tests/e2e/smoke.spec.ts icinde kayitli.
           */
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            const paket = id.split('node_modules/').pop() ?? '';
            if (/^(react|react-dom|scheduler)\//.test(paket)) return 'react-vendor';
            if (/^(framer-motion|motion)\//.test(paket)) return 'motion-vendor';
            if (/^lucide-react\//.test(paket)) return 'icon-vendor';
            return 'vendor';
          },
        },
      },
    },
  };
});
