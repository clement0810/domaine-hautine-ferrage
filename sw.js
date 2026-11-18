const CACHE_NAME = "hunting-map-v39";
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./images/icon-fh-192.png",
  "./images/icon-fh-512.png",
  "./vendor/maplibre-gl/maplibre-gl.js",
  "./vendor/maplibre-gl/maplibre-gl.css",
  "./vendor/pmtiles/pmtiles.js",
  "./vendor/lineclip/index.js",
  "./data/hunting-data.geojson",
  "./data/terrain-summary.json",
  "./data/paths.geojson",
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
const ARCHIVE_CHUNK_SIZE = 1024 * 1024;
const ARCHIVE_META_URL = new URL("./data/hautine_full.pmtiles.meta", self.registration.scope).href;
const archiveChunkUrl = (index) => `${ARCHIVE_META_URL}.chunk-${index}`;

async function cacheArchive(cache) {
  const response = await fetch(new Request(MAP_ARCHIVE_URL, { cache: "reload" }));
  if (!response.ok || !response.body) throw new Error("Map archive download failed");
  const reader = response.body.getReader();
  let chunk = new Uint8Array(ARCHIVE_CHUNK_SIZE);
  let chunkLength = 0;
  let total = 0;
  let index = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    for (let offset = 0; offset < value.length;) {
      const length = Math.min(value.length - offset, chunk.length - chunkLength);
      chunk.set(value.subarray(offset, offset + length), chunkLength);
      chunkLength += length;
      total += length;
      offset += length;
      if (chunkLength === chunk.length) {
        await cache.put(archiveChunkUrl(index++), new Response(chunk));
        chunk = new Uint8Array(ARCHIVE_CHUNK_SIZE);
        chunkLength = 0;
      }
    }
  }
  if (chunkLength) await cache.put(archiveChunkUrl(index), new Response(chunk.subarray(0, chunkLength)));
  if (!total) throw new Error("Map archive is empty");
  await cache.put(ARCHIVE_META_URL, new Response(JSON.stringify({ size: total }), {
    headers: { "Content-Type": "application/json" },
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(FILES_TO_CACHE.map((path) => new Request(path, { cache: "reload" })));
    await cacheArchive(cache);
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

async function respondToArchiveRange(request, cache, size) {
  const range = request.headers.get("range");
  if (!range) {
    let index = 0;
    const stream = new ReadableStream({
      async pull(controller) {
        if (index * ARCHIVE_CHUNK_SIZE >= size) {
          controller.close();
          return;
        }
        const response = await cache.match(archiveChunkUrl(index++));
        if (!response) throw new Error("Offline map archive is incomplete");
        controller.enqueue(new Uint8Array(await response.arrayBuffer()));
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "application/octet-stream", "Content-Length": String(size), "Accept-Ranges": "bytes" },
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }

  const start = match[1] ? Number(match[1]) : Math.max(size - Number(match[2]), 0);
  let end = match[2] && match[1] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }

  end = Math.min(end, size - 1);
  const parts = [];
  for (let index = Math.floor(start / ARCHIVE_CHUNK_SIZE); index <= Math.floor(end / ARCHIVE_CHUNK_SIZE); index++) {
    const response = await cache.match(archiveChunkUrl(index));
    if (!response) throw new Error("Offline map archive is incomplete");
    const chunk = await response.arrayBuffer();
    const chunkStart = index * ARCHIVE_CHUNK_SIZE;
    parts.push(chunk.slice(Math.max(start - chunkStart, 0), Math.min(end - chunkStart + 1, chunk.byteLength)));
  }
  const body = new Blob(parts);
  const headers = new Headers({ "Content-Type": "application/octet-stream" });
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(body.size));
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
      const metadata = await cache.match(ARCHIVE_META_URL);
      if (metadata) return respondToArchiveRange(request, cache, (await metadata.json()).size);
    }

    const cachedResponse = await cache.match(request);
    return cachedResponse || fetch(request);
  })());
});