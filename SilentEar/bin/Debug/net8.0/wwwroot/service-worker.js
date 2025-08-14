/* Manifest version: c5NnLOYD */
// Cache names
const CACHE_NAME = 'silentear-cache-v1';
const OFFLINE_URL = 'index.html';

// Files to cache
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/app.css',
    './manifest.webmanifest',
    './icon-192.png',
    './icon-512.png',
    './_framework/blazor.webassembly.js',
    './js/audioRecorder.js'
];

// Install event - cache assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Caching app assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response; // Return cached version
                }
                return fetch(event.request)
                    .then(response => {
                        // Cache new resources
                        if (response.ok && event.request.method === 'GET') {
                            const responseToCache = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => {
                                    cache.put(event.request, responseToCache);
                                });
                        }
                        return response;
                    })
                    .catch(() => {
                        // Return offline page if network fails
                        if (event.request.mode === 'navigate') {
                            return caches.match(OFFLINE_URL);
                        }
                    });
            })
    );
});
