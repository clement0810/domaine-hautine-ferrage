const CACHE_NAME = "hunting-map-v20";
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./images/icon-192.png",
  "./images/icon-512.png",
  "./vendor/maplibre-gl/maplibre-gl.js",
  "./vendor/maplibre-gl/maplibre-gl.css",
  "./vendor/pmtiles/pmtiles.js",
  "./vendor/lineclip/index.js",
  "./data/hunting-data.geojson",
  "./data/paths.geojson",
  "./data/hautine_full.pmtiles",
  "./images/stands/post_14.jpg",
  "./images/stands/20H.jpg",
  "./images/stands/9L.jpg",
  "./images/stands/19H.jpg",
  "./images/stands/17H.jpg",
  "./images/stands/12L.jpg",
  "./images/stands/13L.jpg",
  "./images/stands/mirador_9.jpg",
  "./images/stands/la_petite_golette.jpg",
  "./images/stands/unnamed_post_1.jpg",
  "./images/stands/unnamed_post_2.jpg",
  "./images/stands/unnamed_post_3.jpg",
  "./images/stands/unnamed_post_4.jpg",
  "./images/stands/unnamed_post_5.jpg",
  "./images/stands/unnamed_post_6.jpg",
  "./images/stands/15H.jpg",
  "./images/stands/14L.jpg",
  "./images/stands/14H.jpg",
  "./images/stands/12H.jpg",
  "./images/stands/17L.jpg",
  "./images/stands/16L.jpg",
  "./images/stands/13H.jpg",
  "./images/stands/18L.jpg",
];
const MAP_ARCHIVE_URL = new URL("./data/hautine_full.pmtiles", self.registration.scope).href;
let archiveBufferPromise;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(FILES_TO_CACHE.map((path) => new Request(path, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith("hunting-map-") && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function getArchiveBuffer(response) {
  if (!archiveBufferPromise) {
    archiveBufferPromise = response.arrayBuffer().catch((error) => {
      archiveBufferPromise = undefined;
      throw error;
    });
  }
  return archiveBufferPromise;
}

async function respondToArchiveRange(request, cachedResponse) {
  const range = request.headers.get("range");
  if (!range) return cachedResponse;

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const archive = await getArchiveBuffer(cachedResponse.clone());
  const size = archive.byteLength;
  if (!match || (!match[1] && !match[2])) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }

  let start = match[1] ? Number(match[1]) : Math.max(size - Number(match[2]), 0);
  let end = match[2] && match[1] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }

  end = Math.min(end, size - 1);
  const body = archive.slice(start, end + 1);
  const headers = new Headers(cachedResponse.headers);
  headers.delete("Content-Encoding");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(body.byteLength));
  return new Response(body, { status: 206, headers });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (requestUrl.href === MAP_ARCHIVE_URL) {
      const archive = await cache.match(MAP_ARCHIVE_URL);
      if (archive) return respondToArchiveRange(request, archive);
    }

    const cachedResponse = await cache.match(request);
    return cachedResponse || fetch(request);
  })());
});