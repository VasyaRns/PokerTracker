import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

const base = '/PokerTracker/'

function githubPagesFallback(): Plugin {
  return {
    name: 'github-pages-404',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const page = bundle['index.html']
      if (!page || page.type !== 'asset') return
      this.emitFile({
        type: 'asset',
        fileName: '404.html',
        source: page.source,
      })
    },
  }
}

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      scope: base,
      includeAssets: ['favicon.svg', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: 'PokerTracker',
        short_name: 'PokerTracker',
        description: 'Личный учёт префлоп-статистики',
        lang: 'ru',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#0c1612',
        theme_color: '#0c1612',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^\/PokerTracker\//],
        runtimeCaching: [],
      },
      devOptions: {
        enabled: false,
      },
    }),
    githubPagesFallback(),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
