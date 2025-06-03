const CACHE_NAME = 'sukuna-pwa-v4';
const OFFLINE_URL = '/offline.html';

// Only cache essential local assets
const CORE_ASSETS = [
  './', 
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/css/style.css',
  '/css/loginstyle.css',
  '/css/signup.css',
  '/js/cloudflare-jsd.js',
  '/js/server.js',
  '/js/js.js',
  '/js/backbutton.js',
  '/js/login.js',
  '/js/signup.js',
  '/js/login signup.js',
  '/install.js',
  '/images/icon-192x192.png',
  '/images/icon-512x512.png',
  '/images/car-1.webp',
  '/images/1.webp',
  '/images/2.webp',
  '/images/3.webp',
  '/images/4.webp',
  '/images/5.webp',
  '/images/6.webp',
  '/images/man.webp',
  '/images/woman.webp',
  '/images/x-lg.svg',
  '/images/ki.jpg',
  '/login.html',
  '/signup.html'
];

// Install event - cache core resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching core resources...');
        return cache.addAll(CORE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        // Cache secondary assets in the background
        caches.open(CACHE_NAME).then(cache => {
          console.log('Caching secondary resources in background...');
          cache.addAll(SECONDARY_ASSETS).catch(error => {
            console.log('Background caching error:', error);
          });
        });
        
        return self.clients.claim();
      })
  );
});

// Helper function to handle Netlify's redirect behavior
function isNetlifyRedirect(url) {
  // Netlify often serves /page instead of /page.html or /page/index.html
  return url.pathname.indexOf('.') === -1 && !url.pathname.endsWith('/');
}

// Helper function to try alternative URLs for Netlify
async function tryAlternativeNetlifyUrls(request) {
  const url = new URL(request.url);
  const alternativeUrls = [];
  
  // Try with .html extension
  if (!url.pathname.endsWith('/') && !url.pathname.includes('.')) {
    alternativeUrls.push(new Request(`${url.origin}${url.pathname}.html${url.search}`));
  }
  
  // Try with /index.html
  if (!url.pathname.endsWith('/')) {
    alternativeUrls.push(new Request(`${url.origin}${url.pathname}/index.html${url.search}`));
  }
  
  // Try each alternative URL
  for (const altRequest of alternativeUrls) {
    const cachedResponse = await caches.match(altRequest);
    if (cachedResponse) {
      return cachedResponse;
    }
  }
  
  return null;
}

// Fetch event - handle CDN requests separately
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Handle CDN requests
  if (url.host.includes('cdn.jsdelivr.net')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Return empty CSS for CDN stylesheets
        if (url.pathname.endsWith('.css')) {
          return new Response('', { headers: { 'Content-Type': 'text/css' } });
        }
        // Return empty JS for CDN scripts
        if (url.pathname.endsWith('.js')) {
          return new Response('', { headers: { 'Content-Type': 'application/javascript' } });
        }
        // For other CDN resources, return empty response
        return new Response('', { status: 200 });
      })
    );
    return;
  }
  
  // Handle navigation requests
  if (event.request.mode === 'navigate' || 
      event.request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the latest version
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clonedResponse);
          });
          return response;
        })
        .catch(async () => {
          // Try from cache
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // Try alternative URLs for Netlify
          if (isNetlifyRedirect(url)) {
            const netlifyResponse = await tryAlternativeNetlifyUrls(event.request);
            if (netlifyResponse) {
              return netlifyResponse;
            }
          }
          
          // Fallback to offline page
          return caches.match(OFFLINE_URL);
        })
    );
    return;
  }
  
  // Handle local assets - cache first with network fallback
  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) return cachedResponse;
      
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        return new Response('Offline content not available', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    })()
  );
});

// Periodic cache update when online
self.addEventListener('sync', (event) => {
  if (event.tag === 'update-cache') {
    event.waitUntil(
      caches.open(CACHE_NAME).then(cache => {
        return Promise.all([...CORE_ASSETS, ...SECONDARY_ASSETS].map(url => {
          return fetch(url).then(response => {
            if (response && response.ok) {
              return cache.put(url, response);
            }
          }).catch(error => {
            console.log('Failed to update cache for:', url, error);
          });
        }));
      })
    );
  }
});

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
