self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Intercept fake video URLs used to bypass IDM
    // IDM will attempt to fetch these directly and receive a 404.
    // The Service Worker silently proxies them to the real hidden endpoints.
    if (url.pathname.startsWith('/protected-media/')) {
        const token = url.searchParams.get('t');
        const quality = url.searchParams.get('q');
        
        let realUrl = '/api/video?t=' + token;
        if (quality === 'auto') {
            realUrl = '/api/video/auto?t=' + token;
        }
        
        const headers = new Headers(event.request.headers);
        
        const req = new Request(realUrl, {
            method: 'GET',
            headers: headers,
            mode: 'same-origin',
            credentials: 'omit',
            cache: 'no-store'
        });
        
        event.respondWith(fetch(req));
    }
});