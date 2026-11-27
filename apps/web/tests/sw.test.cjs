const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function worker() {
  const handlers = {};
  const entries = new Map();
  const deleted = [];
  const cache = {
    add: async (request) => { entries.set(request.url, new Response("offline")); },
    match: async (url) => entries.get(url),
  };
  const caches = {
    open: async () => cache,
    keys: async () => ["indmotos-offline-v0", "indmotos-offline-v1", "other-app"],
    delete: async (key) => { deleted.push(key); },
  };
  const self = {
    location: { origin: "https://example.test" },
    addEventListener: (type, handler) => { handlers[type] = handler; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  class LocalRequest {
    constructor(url) { this.url = url; }
  }
  const context = { self, caches, Request: LocalRequest, Response, URL, fetch: async () => new Response("online") };
  vm.runInNewContext(readFileSync(path.join(__dirname, "..", "public", "sw.js"), "utf8"), context);
  return { handlers, entries, deleted, context };
}

test("stores only the offline page and removes only old application caches", async () => {
  const { handlers, entries, deleted } = worker();
  let pending;
  handlers.install({ waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.deepEqual([...entries.keys()], ["/offline.html"]);
  handlers.activate({ waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.deepEqual(deleted, ["indmotos-offline-v0"]);
});

test("navigation uses the network and falls back offline without intercepting API requests", async () => {
  const { handlers, entries, context } = worker();
  entries.set("/offline.html", new Response("offline"));
  let response;
  const navigate = { url: "https://example.test/admin/leads/cadastrar", mode: "navigate" };
  handlers.fetch({ request: navigate, respondWith: (promise) => { response = promise; } });
  assert.equal(await (await response).text(), "online");

  context.fetch = async () => { throw new Error("offline"); };
  handlers.fetch({ request: navigate, respondWith: (promise) => { response = promise; } });
  assert.equal(await (await response).text(), "offline");

  for (const request of [
    { url: "https://example.test/api/leads", mode: "navigate" },
    { url: "https://example.test/api/v1/leads", mode: "cors" },
    { url: "https://example.test/assets/index.js", mode: "no-cors" },
    { url: "https://other.test/", mode: "navigate" },
  ]) {
    let intercepted = false;
    handlers.fetch({ request, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false);
  }
});
