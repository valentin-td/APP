/* eslint-disable no-restricted-globals */

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Écoute les événements Web Push envoyés par le serveur
self.addEventListener('push', (event) => {
    if (!event.data) return;

    try {
        const data = event.data.json();
        const title = data.title || 'Nouvelle notification STACK';
        const options = {
            body: data.body || '',
            icon: '/icon-192x192.png',
            badge: '/icon-192x192.png',
            vibrate: [200, 100, 200],
            data: {
                url: data.url || '/'
            }
        };

        event.waitUntil(
            self.registration.showNotification(title, options)
        );
    } catch (e) {
        console.error("Erreur de parsing de la notification push", e);
    }
});

// Gère le clic sur la notification
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    // Si la notification contient une URL, on l'ouvre
    if (event.notification.data && event.notification.data.url) {
        event.waitUntil(
            self.clients.matchAll({ type: 'window' }).then((clientList) => {
                // Cherche si un onglet STACK est déjà ouvert pour le focaliser
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.navigate(event.notification.data.url);
                        return client.focus();
                    }
                }
                // Sinon ouvre une nouvelle fenêtre
                if (self.clients.openWindow) {
                    return self.clients.openWindow(event.notification.data.url);
                }
            })
        );
    }
});
