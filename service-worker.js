const CACHE_NAME = 'sukuna-pwa-v4';
const OFFLINE_URL = '/offline.html';

// Resources to cache immediately on install
const CORE_ASSETS = [
  './', 
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/css/style.css',
  '/css/loginstyle.css',
  '/css/signup.css',
  '/js/cloudflare-jsd.js',
  '/images/icon-192x192.png',
  '/images/icon-512x512.png',
  '/images/favicon (1).ico'
];

// Additional resources to cache when possible
const SECONDARY_ASSETS = [
  '/js/server.js',
  '/js/js.js',
  '/js/backbutton.js',
  '/js/login.js',
  '/js/signup.js',
  '/js/login signup.js',
  '/install.js',
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
  '/signup.html',
  'https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css',
  'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css',
  'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js',
];

// Install event - cache core resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching core resources...');
        // Add all core assets and fallback to offline page
        return cache.addAll([...CORE_ASSETS, OFFLINE_URL]);
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

// Fetch event - improved offline handling
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests and browser extensions
  if (event.request.method !== 'GET' || 
      url.origin !== self.location.origin && 
      !url.href.includes('cdn.jsdelivr.net')) {
    return;
  }
  
  // HTML pages - cache first with network fallback
  if (event.request.mode === 'navigate' || 
      event.request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      (async () => {
        try {
          // Try to fetch from network first
          const networkResponse = await fetch(event.request);
          // Update cache with fresh response
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, networkResponse.clone());
          return networkResponse;
        } catch (error) {
          // Network failed - try cache
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) return cachedResponse;
          
          // Handle root path specifically
          if (url.pathname === '/') {
            const rootResponse = await caches.match('/index.html');
            if (rootResponse) return rootResponse;
          }
          
          // Try alternative URLs for Netlify
          if (isNetlifyRedirect(url)) {
            const netlifyResponse = await tryAlternativeNetlifyUrls(event.request);
            if (netlifyResponse) return netlifyResponse;
          }
          
          // Fallback to offline page for all navigation failures
          return caches.match(OFFLINE_URL);
        }
      })()
    );
    return;
  }
  
  // For assets - cache first, then network
  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) {
        // Update cache in background
        event.waitUntil(
          (async () => {
            try {
              const networkResponse = await fetch(event.request);
              if (networkResponse && networkResponse.ok) {
                const cache = await caches.open(CACHE_NAME);
                await cache.put(event.request, networkResponse.clone());
              }
            } catch (error) {
              // Ignore network errors for background update
            }
          })()
        );
        return cachedResponse;
      }
      
      // Not in cache, try network
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.ok) {
          // Cache the response for future
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        // For images, return a placeholder if available
        if (event.request.url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) {
          const placeholder = await caches.match('/images/placeholder.svg');
          if (placeholder) return placeholder;
        }
        
        // For other resources, return an error response
        return new Response('Offline content not available', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/plain'
          })
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
