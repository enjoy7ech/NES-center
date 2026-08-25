const CACHE_PREFIX = 'fc-center-'
const CACHE_NAME = `${CACHE_PREFIX}v5`
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request))
    return
  }

  if (url.pathname.startsWith('/cheat/')) {
    event.respondWith(networkFirst(request))
    return
  }

  event.respondWith(cacheFirst(request))
})

async function networkFirstPage(request) {
  const cache = await caches.open(CACHE_NAME)

  try {
    const response = await fetch(request)
    if (response.ok) await cache.put('/index.html', response.clone())
    return response
  } catch {
    return (await cache.match('/index.html')) || Response.error()
  }
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME)

  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  } catch {
    return (await cache.match(request)) || Response.error()
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    const contentType = response.headers.get('content-type')?.toLowerCase() || ''
    const isHtmlFallback = contentType.includes('text/html')
      && !new URL(request.url).pathname.endsWith('.html')
    if (response.ok && !isHtmlFallback) await cache.put(request, response.clone())
    return response
  } catch {
    return Response.error()
  }
}
