const CACHE_NAME = 'transit-pass-v10';
const ASSETS = [
    './',
    './index.html',
    './setup.html',
    './pass.html',
    './journal.html',
    './help.html',
    './style.css',
    './app.js',
    './setup.js',
    './pass.js',
    './journal.js',
    './manifest.json',
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        fetch(e.request).then(response => {
            if (e.request.method === 'GET' && !e.request.url.includes('googletagmanager') && !e.request.url.includes('yandex.ru')) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
            }
            return response;
        }).catch(() => caches.match(e.request))
    );
});
