/* ============================================================
   TINDIG-KALUSUGAN — Service Worker
   Caches the app shell (this is a single-page app, so caching
   index.html covers every health-guide section: heat/hydration,
   fatigue, respiratory, ergonomics, first aid, symptom guide,
   nutrition, and the referral directory all live in that one file).
   ============================================================ */

var CACHE_NAME = 'tindig-kalusugan-v1';
var APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function(event){
  // Do NOT auto-cache everything silently — the page's "Prepare for
  // Offline Use" button is the explicit, user-initiated trigger for that
  // (per the offline-access spec: caching only happens after user action
  // while online, with visible progress/confirmation).
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(key){ return key !== CACHE_NAME; })
            .map(function(key){ return caches.delete(key); })
      );
    }).then(function(){ return self.clients.claim(); })
  );
});

/* Message from the page: cache the app shell now (used by the
   "Prepare for Offline Use" button). Replies with ok/fail + which
   files succeeded, so the page can show real progress/confirmation. */
self.addEventListener('message', function(event){
  if(!event.data || event.data.type !== 'CACHE_APP_SHELL') return;
  var port = event.ports && event.ports[0];

  caches.open(CACHE_NAME).then(function(cache){
    var results = [];
    var tasks = APP_SHELL.map(function(url){
      return cache.add(url)
        .then(function(){ results.push({ url: url, ok: true }); })
        .catch(function(err){ results.push({ url: url, ok: false, error: String(err) }); });
    });
    return Promise.all(tasks).then(function(){
      if(port) port.postMessage({ type: 'CACHE_DONE', results: results });
    });
  }).catch(function(err){
    if(port) port.postMessage({ type: 'CACHE_DONE', results: [], error: String(err) });
  });
});

/* Fetch handling: cache-first for app-shell files (works offline
   once cached), falling back to network, and falling back to the
   cached index.html for any navigation that fails while offline. */
self.addEventListener('fetch', function(event){
  if(event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(function(cached){
      if(cached) return cached;

      return fetch(event.request).then(function(networkResponse){
        // Opportunistically keep the app shell fresh.
        if(event.request.url.indexOf(self.location.origin) === 0){
          var copy = networkResponse.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, copy); });
        }
        return networkResponse;
      }).catch(function(){
        if(event.request.mode === 'navigate'){
          return caches.match('./index.html');
        }
        return new Response('', { status: 504, statusText: 'Offline at hindi pa naka-cache' });
      });
    })
  );
});
