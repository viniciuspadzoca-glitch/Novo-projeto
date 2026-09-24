/* Service Worker — offline-first, mas SEMPRE com código atualizado (network-first para JS/CSS/HTML) */
const CACHE = 'sis-sacolasedex-v6';
const ESSENCIAIS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
    '/icon-maskable-192.png',
    '/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then((cache) => cache.addAll(ESSENCIAIS).catch(() => undefined)),
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((chaves) => Promise.all(chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
            .then(() => self.clients.claim()),
    );
});

function redeComFallback(request, chaveCache) {
    return fetch(request)
        .then((resp) => {
            if (resp && resp.ok) {
                const copia = resp.clone();
                caches.open(CACHE).then((c) => c.put(chaveCache || request, copia));
            }
            return resp;
        })
        .catch(() => caches.match(chaveCache || request));
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;

    // Documento: sempre rede primeiro
    if (request.mode === 'navigate') {
        event.respondWith(redeComFallback(request, '/index.html'));
        return;
    }

    // Código da aplicação (JS/CSS/JSX/módulos): rede primeiro para nunca servir versão antiga
    const ehCodigo = /\.(?:js|mjs|jsx|css|json|map)$/i.test(url.pathname) || url.search.includes('t=');
    if (ehCodigo) {
        event.respondWith(redeComFallback(request));
        return;
    }

    // Demais estáticos (imagens, fontes): cache primeiro
    event.respondWith(
        caches.match(request).then((cached) => cached || redeComFallback(request)),
    );
});
