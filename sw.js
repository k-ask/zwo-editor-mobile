const CACHE_NAME = 'zwo-mobile-v1';
const ASSETS = [
    '/zwo-editor-mobile/',
    '/zwo-editor-mobile/index.html',
    '/zwo-editor-mobile/style.css',
    '/zwo-editor-mobile/editor.js',
    '/zwo-editor-mobile/manifest.json',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then(response => response || fetch(e.request))
    );
});