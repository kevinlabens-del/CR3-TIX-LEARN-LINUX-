import assert from "node:assert/strict";
import test from "node:test";

test("rend la marque, les métadonnées françaises et aucun marqueur de développement", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(html, /CR3@TIX Learn Linux/);
  assert.match(html, /<html[^>]+lang=["']fr["']/i);
  assert.doesNotMatch(html, /codex-preview/i);
});
