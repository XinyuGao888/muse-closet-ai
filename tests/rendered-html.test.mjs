import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Muse Closet product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Muse Closet/);
  assert.match(html, /今天穿什么/);
  assert.match(html, /今天的 3 套推荐/);
  assert.match(html, /上传衣物/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/i);
});

test("ships the product routes, persistence model, and social image", async () => {
  const [component, schema, recommendationRoute, feedbackRoute] = await Promise.all([
    readFile(new URL("../app/wardrobe-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/recommendations/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/feedback/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(component, /dominantColorAndCutout/);
  assert.match(component, /compositeTryOn/);
  assert.match(component, /喜欢|拒绝|保存|实际穿着/);
  assert.match(schema, /garments|outfits|feedback/);
  assert.match(recommendationRoute, /rankOutfits/);
  assert.match(feedbackRoute, /affinityDelta/);
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await assert.rejects(access(new URL("../app/_sites-preview/preview.css", import.meta.url)));
  await access(projectRoot);
});
