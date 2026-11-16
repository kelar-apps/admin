import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // GitHub Pages serves project sites from /<repo-name>/. Set VITE_BASE in CI.
  const base = env.VITE_BASE || '/';

  return {
    base,
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    // 5173 is registered as an OAuth origin and also used by the Tracker app;
    // run only one of them at a time.
    server: { port: 5173, strictPort: true },
    preview: { port: 5173, strictPort: true },
    plugins: [
      VitePWA({
        registerType: 'prompt',
        injectRegister: false, // registered from src/core/pwa.js
        includeAssets: ['icons/favicon.ico', 'icons/favicon.svg', 'icons/apple-touch-icon.png', 'brand/*.svg'],
        manifest: {
          id: base,
          name: 'Kelar Admin',
          short_name: 'Kelar Admin',
          description: 'Aktifkan dan kelola akses pembeli aplikasi Kelar.',
          lang: 'id',
          start_url: base,
          scope: base,
          display: 'standalone',
          orientation: 'portrait',
          theme_color: '#13235B',
          background_color: '#F8F7FB',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // App shell only. Buyer data always comes fresh from the license server and
          // is never cached (no runtimeCaching).
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
        },
        devOptions: { enabled: false },
      }),
    ],
    test: {
      include: ['test/**/*.test.js'],
      environment: 'node',
    },
  };
});
