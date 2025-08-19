const CACHE_NAME = 'happydate-v1';
const ASSETS = [
  '/', '/index.html',
  '/assets/css/style.css',
  '/assets/img/favicon-32x32.png',
  '/assets/img/apple-touch-icon.png'
  // за бажанням додай інші статичні файли
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // сторінки — network-first (щоб не віддавати застаріле), статика — cache-first
  if (req.destination === 'document') {
    e.respondWith(
      fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, clone));
        return res;
      }).catch(() => caches.match(req))
    );
  } else {
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req))
    );
  }
});
