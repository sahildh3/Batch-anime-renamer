/**
 * sw.js — Video Specialist Renamer V3
 * Service Worker — Cache-first strategy for all app shell assets.
 * Version bump CACHE_VERSION to force cache refresh on updates.
 */

'use strict';

const CACHE_VERSION = 'vsr-v3.0.0';
const CACHE_NAME    = `vsr-app-${CACHE_VERSION}`;

/** All files that make up the application shell */
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './parser.js',
  './app.js',
  './jszip.min.js',
  './manifest.json',
];

/* ── INSTALL: cache the shell ─────────────────────────────────── */
self.addEventListener('install', event => {
  console.log('[SW] Install:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching app shell');
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: delete old caches ──────────────────────────────── */
self.addEventListener('activate', event => {
  console.log('[SW] Activate:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('vsr-app-') && k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: cache-first, network fallback ─────────────────────── */
self.addEventListener('fetch', event => {
  // Only handle GET requests for our own origin
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Serve from cache immediately, then update in background
        fetchAndUpdate(event.request);
        return cached;
      }
      // Not cached — fetch from network and cache response
      return fetchAndUpdate(event.request);
    }).catch(() => {
      // Final fallback for navigation requests
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});

async function fetchAndUpdate(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match(request);
  }
}
