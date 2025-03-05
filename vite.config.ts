import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'amateur.txt', 'preview-large.png', 'preview-small.png'],
      manifest: {
        name: 'HamSats',
        short_name: 'HamSats',
        description: 'Amateur radio satellite tracking and visualization',
        theme_color: '#2c3e50',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        id: '/',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        categories: ['utilities', 'navigation'],
        shortcuts: [
          {
            name: 'Open HamSats',
            short_name: 'HamSats',
            url: '/',
            icons: [
              {
                src: '/icons/icon-192x192.png',
                sizes: '192x192',
                type: 'image/png'
              }
            ]
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,txt}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/celestrak\.org\/NORAD\/elements\/amateur\.txt/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'celestrak-cache',
              expiration: {
                maxAgeSeconds: 24 * 60 * 60 // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200] // Also cache opaque responses
              },
              networkTimeoutSeconds: 10, // Timeout after 10 seconds
              matchOptions: {
                ignoreSearch: true // Ignore query parameters
              },
              plugins: [
                {
                  // Custom plugin to handle fetch failures
                  handlerDidError: async ({ request }) => {
                    // Try to return cached response if available
                    const cache = await caches.open('celestrak-cache');
                    const cachedResponse = await cache.match(request);
                    if (cachedResponse) return cachedResponse;
                    
                    // If no cached response, return an empty response
                    return new Response('', {
                      status: 200,
                      statusText: 'OK',
                      headers: new Headers({
                        'Content-Type': 'text/plain',
                        'Cache-Control': 'no-cache'
                      })
                    });
                  }
                }
              ]
            }
          },
          {
            urlPattern: /^https:\/\/api\.open-elevation\.com\/api\/v1\/lookup/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'elevation-cache',
              expiration: {
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/[a-z].tile.openstreetmap.org\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: {
                maxEntries: 1000,
                maxAgeSeconds: 7 * 24 * 60 * 60 // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ],
        cleanupOutdatedCaches: true,
        sourcemap: true,
        navigateFallback: 'index.html'
      },
      devOptions: {
        enabled: true,
        type: 'module'
      },
      injectRegister: 'auto'
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
}) 