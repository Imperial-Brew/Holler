import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // Only precache static app-shell assets — never API or sync traffic
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallback: 'index.html',
        // Let all /api requests pass through to the network
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        name: 'Holler',
        short_name: 'Holler',
        description: 'Offline-first property & task management',
        display: 'standalone',
        theme_color: '#3b82f6',
        background_color: '#1e293b',
        icons: [
          {
            src: 'holler-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'holler-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
})
