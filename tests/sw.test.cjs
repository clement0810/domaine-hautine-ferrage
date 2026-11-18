const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

test("the cached archive serves complete and partial offline requests", async () => {
  const chunkSize = 1024 * 1024;
  const bytes = Uint8Array.from({ length: chunkSize + 12 }, (_, index) => index % 251);
  const entries = new Map();
  const cache = {
    async put(key, response) { entries.set(key, response); },
    async match(key) { return entries.get(key)?.clone(); },
  };
  const context = {
    URL, Request, Response, Headers, Blob, ReadableStream, Uint8Array,
    self: { registration: { scope: "https://example.test/" }, addEventListener() {} },
    fetch: async () => new Response(new ReadableStream({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 300000) {
          controller.enqueue(bytes.subarray(offset, offset + 300000));
        }
        controller.close();
      },
    })),
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require("node:path").join(__dirname, "..", "sw.js"), "utf8"), context);
  await context.cacheArchive(cache);

  const metadata = await cache.match("https://example.test/data/hautine_full.pmtiles.meta");
  assert.equal((await metadata.json()).size, bytes.length);
  context.fetch = () => { throw new Error("network unavailable"); };

  const full = await context.respondToArchiveRange(new Request("https://example.test/"), cache, bytes.length);
  assert.equal(full.status, 200);
  assert.deepEqual(new Uint8Array(await full.arrayBuffer()), bytes);

  for (const [range, start, end] of [
    ["bytes=1048570-1048583", 1048570, 1048583],
    ["bytes=-5", bytes.length - 5, bytes.length - 1],
    ["bytes=1048584-", 1048584, bytes.length - 1],
  ]) {
    const request = new Request("https://example.test/", { headers: { range } });
    const response = await context.respondToArchiveRange(request, cache, bytes.length);
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), `bytes ${start}-${end}/${bytes.length}`);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes.slice(start, end + 1));
  }

  const invalid = new Request("https://example.test/", { headers: { range: "bytes=99999999-" } });
  assert.equal((await context.respondToArchiveRange(invalid, cache, bytes.length)).status, 416);
  entries.delete("https://example.test/data/hautine_full.pmtiles.meta.chunk-1");
  const missing = new Request("https://example.test/", { headers: { range: "bytes=1048576-" } });
  await assert.rejects(context.respondToArchiveRange(missing, cache, bytes.length), /incomplete/);
});