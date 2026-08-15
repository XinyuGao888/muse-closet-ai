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
  assert.match(html, /智能建档/);
  assert.match(html, /灵感穿搭库/);
  assert.match(html, /虚拟试穿/);
  assert.match(html, /穿搭日历/);
  assert.match(html, /一键安排下周一到周五/);
  assert.match(html, /直接告诉 Muse/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/i);
});

test("ships the P0 daily loop, task review, try-on archive, and wardrobe analytics", async () => {
  const [
    component,
    p0Views,
    calendarRoute,
    styleRoute,
    batchRoute,
    tryonRoute,
    analyticsRoute,
    recommendationRoute,
    serverP0,
    schema,
    migration,
  ] = await Promise.all([
    readFile(new URL("../app/wardrobe-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/p0-views.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/calendar/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/style-query/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/intake-jobs/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/try-on/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/analytics/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/recommendations/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/server-p0.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_daily_loop.sql", import.meta.url), "utf8"),
  ]);

  assert.match(component, /startVoiceInput|planWeek|markPlanWorn|BatchIntakeCenter/);
  assert.match(p0Views, /CalendarPlanner|与上一次相比|WardrobeAnalyticsDashboard/);
  assert.match(calendarRoute, /plan_week|weekly_ai|fetchWeatherForecast/);
  assert.match(styleRoute, /requestedWeather|formality|rankOutfits/);
  assert.match(batchRoute, /BATCH_SEGMENT_URL|reanalyzeStoredImage|product_image_url/);
  assert.match(tryonRoute, /previous_session_id|progress = 100|favorite/);
  assert.match(analyticsRoute, /days30|isolatedItems|missingBasics/);
  assert.match(recommendationRoute, /availability_status IN \('available', 'stored'\)/);
  assert.match(serverP0, /wear_events|availability_status = 'worn'/);
  assert.match(schema, /wearEvents|outfitPlans|intakeJobs|intakeItems/);
  assert.match(migration, /idx_wear_events_user_garment_date|idx_outfit_plans_user_date/);
});

test("ships all three product phases, persistence model, and social image", async () => {
  const [component, advanced, schema, recommendationRoute, feedbackRoute, intakeRoute, bodyRoute, migration] = await Promise.all([
    readFile(new URL("../app/wardrobe-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/advanced-views.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/recommendations/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/feedback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/intake/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/body-model/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_intake_inspiration_body.sql", import.meta.url), "utf8"),
  ]);

  assert.match(component, /dominantColorAndCutout/);
  assert.match(component, /compositeTryOn/);
  assert.match(component, /喜欢|拒绝|保存|实际穿着/);
  assert.match(component, /toggleTryOnItem|importProductLink|analyzeIntake/);
  assert.match(advanced, /InspirationLibrary|PreferenceDashboard|BodyStudio/);
  assert.match(schema, /garmentSources|inspirations|preferenceProfiles|bodyModels|tryonSessions/);
  assert.match(recommendationRoute, /rankOutfits/);
  assert.match(feedbackRoute, /affinityDelta/);
  assert.match(intakeRoute, /OCR_BARCODE_URL|PRODUCT_IMPORT_URL/);
  assert.match(bodyRoute, /SAM3D_BODY_URL|MHR_URL/);
  assert.match(migration, /garment_sources|preference_profiles|body_models/);
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await assert.rejects(access(new URL("../app/_sites-preview/preview.css", import.meta.url)));
  await access(projectRoot);
});
