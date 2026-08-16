import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      events: "events/",
    },
  },
  server: {
    host: "127.0.0.1",
    port: 3005,
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "TournamentTree",
        short_name: "TournamentTree",
        description: "Offline-first double-elimination tournament manager",
        theme_color: "#111318",
        background_color: "#111318",
        display: "standalone",
        start_url: "./#/",
        scope: "./",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
});
