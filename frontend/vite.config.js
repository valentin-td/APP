import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Vous vous enregistrez déjà "à la main" dans main.jsx via
      // `virtual:pwa-register` (pour piloter onNeedRefresh / onOfflineReady).
      // injectRegister DOIT rester à false : sinon le plugin injecte EN PLUS
      // son propre script d'enregistrement dans index.html, ce qui crée un
      // double enregistrement du Service Worker. Sur iOS Safari en
      // particulier, ce double register est une cause classique de SW qui
      // reste bloqué en "waiting" et ne prend jamais le contrôle de la page.
      injectRegister: false,
      registerType: 'autoUpdate',

      // Vous avez déjà un public/manifest.json + un <link rel="manifest">
      // écrit à la main dans index.html. Si on laisse `manifest` actif ici,
      // vite-plugin-pwa génère ET injecte SON PROPRE manifest.webmanifest en
      // plus, ce qui donne deux balises <link rel="manifest"> concurrentes
      // dans le HTML buildé. On désactive donc la génération du plugin et on
      // garde votre manifest.json existant tel quel.
      manifest: false,

      // ESSENTIEL POUR VOS TESTS : par défaut, vite-plugin-pwa ne génère
      // AUCUN Service Worker en mode `vite dev`. Si vous testez le mode avion
      // avec `npm run dev`, il n'y a tout simplement aucun SW pour intercepter
      // la requête de rechargement : le navigateur affiche alors sa propre
      // page d'erreur DNS/"pas de connexion", ce qui correspond exactement à
      // votre symptôme. Ce bloc active un vrai SW en dev.
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
      },

      // Fichiers du dossier public/ à précacher explicitement même s'ils ne
      // matchent pas globPatterns (ex: manifest.json, robots.txt).
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'icon-192x192.png',
        'icon-512x512.png',
        'manifest.json',
      ],

      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],

        // Le SW prend le contrôle de la page IMMÉDIATEMENT après son
        // installation, sans attendre un deuxième reload. C'est la cause la
        // plus fréquente d'un "ça marche parfois, parfois pas" : sans ces
        // deux options, un SW fraîchement installé (premier déploiement,
        // ou première visite d'un poste de caisse) reste en état "waiting"
        // et ne sert donc pas encore le fallback offline au reload suivant.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,

        // Redirige toute navigation (reload, ouverture de l'app) vers
        // index.html précaché quand le réseau est indisponible.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [
          // Ne jamais appliquer le fallback SPA aux appels API.
          /^\/api\//,
          // Ne jamais appliquer le fallback à une requête qui vise un vrai
          // fichier statique (a une extension) : évite de recevoir
          // index.html à la place d'une image manquante, par exemple.
          /\/[^/?]+\.[^/]+$/,
        ],

        runtimeCaching: [
          {
            // Matcher explicite par origine + chemin, plus fiable qu'une
            // regex globale sur toute l'URL.
            urlPattern: ({ url }) =>
              url.origin === 'https://api-salon-backend.onrender.com' &&
              url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            // IMPORTANT : on restreint explicitement au GET. Les POST
            // (/api/caisse/payer, etc.) ne sont de toute façon jamais mis en
            // cache par Workbox par défaut, mais on le rend explicite ici
            // pour ne pas dépendre d'un comportement implicite : la file
            // d'attente offline de ces requêtes reste gérée par votre code
            // applicatif (localforage), pas par le Service Worker.
            method: 'GET',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 24 * 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
});
