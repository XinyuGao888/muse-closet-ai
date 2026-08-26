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

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("security-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

test("server-renders the public Muse Closet privacy and sign-in shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Muse Closet/);
  assert.match(html, /衣柜属于你/);
  assert.match(html, /使用 ChatGPT 登录/);
  assert.match(html, /个人数据隔离/);
  assert.match(html, /图片私有访问/);
  assert.match(html, /一键删除数据/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/i);
});

test("ships multi-user auth, privacy, quota, deletion, and cost controls", async () => {
  const [page, worker, account, security, schema, runtime, migration, wardrobeImage] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/account/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/security.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0005_multi_user_safety.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/wardrobe/image/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /getChatGPTUser|chatGPTSignInPath|个人数据隔离/);
  assert.match(worker, /AUTH_REQUIRED|INVALID_ORIGIN|REQUEST_TOO_LARGE|x-frame-options/);
  assert.match(account, /ai_processing_consent|WARDROBE_IMAGES\.delete|clear-site-data|DELETE FROM/);
  assert.match(account, /imageKeyStatements|Promise\.all/);
  assert.doesNotMatch(account, /UNION ALL SELECT/);
  assert.match(security, /reserveUpload|reserveModelCall|validateImageFile|GLOBAL_DAILY_MODEL_BUDGET_MICROS|GLOBAL_MODEL_BUDGET_EXCEEDED/);
  assert.match(schema, /appUsers|usageDaily|usageEvents/);
  assert.match(runtime, /CREATE TABLE IF NOT EXISTS app_users|CREATE TABLE IF NOT EXISTS usage_daily/);
  assert.match(migration, /usage_events|idx_intake_items_user_job_status/);
  assert.match(wardrobeImage, /privateImageHeaders/);
});

test("ships dual Sites and Supabase auth without trusting browser identity headers", async () => {
  const [workerSource, supabaseShell, runtimeAuth, directConfig, sitesConfig, accountRoute] = await Promise.all([
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/supabase-auth.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/runtime-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.cloudflare.jsonc", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/account/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(workerSource, /getClaims|muse_supabase_access_token|HttpOnly|withRuntimeAuth/);
  assert.match(supabaseShell, /signInWithOtp|emailRedirectTo|onAuthStateChange|signInWithOAuth/);
  assert.match(supabaseShell, /signInAnonymously|直接游客体验|user\.is_anonymous/);
  assert.match(runtimeAuth, /x-muse-auth-provider|SUPABASE|publishableKey/i);
  assert.match(directConfig, /AUTH_PROVIDER[\s\S]*supabase/);
  assert.match(directConfig, /"binding": "DB"/);
  assert.match(directConfig, /"binding": "WARDROBE_IMAGES"/);
  assert.doesNotMatch(directConfig, /SUPABASE_SECRET_KEY|sb_secret_/);
  assert.match(sitesConfig, /project_id/);
  assert.match(accountRoute, /auth\.admin\.deleteUser|SUPABASE_SECRET_KEY/);

  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("https://muse.example/api/wardrobe", {
      headers: { "oai-authenticated-user-id": "spoofed-user", "oai-authenticated-user-email": "attacker@example.com" },
    }),
    {
      AUTH_PROVIDER: "supabase",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "AUTH_REQUIRED");

  const clearResponse = await worker.fetch(
    new Request("https://muse.example/api/auth/session", { method: "DELETE", headers: { origin: "https://muse.example" } }),
    {
      AUTH_PROVIDER: "supabase",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(clearResponse.status, 204);
  assert.match(clearResponse.headers.get("set-cookie") ?? "", /HttpOnly.*Max-Age=0.*Secure/);
});

test("ships the P1 creative canvas, relationship graph, shopping advisor, reminders, and real-world diary", async () => {
  const [
    app,
    views,
    canvasRoute,
    relationRoute,
    shoppingRoute,
    reminderRoute,
    diaryRoute,
    serverP1,
    schema,
    runtime,
    migration,
    serviceWorker,
  ] = await Promise.all([
    readFile(new URL("../app/wardrobe-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/p1-views.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/outfit-canvas/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/garment-relations/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/shopping-advisor/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/reminders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/diary/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/server-p1.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0003_p1_differentiation.sql", import.meta.url), "utf8"),
    readFile(new URL("../public/muse-sw.js", import.meta.url), "utf8"),
  ]);

  assert.match(app, /saveOutfitCard|openGarmentRelation|analyzeShopping|locateWeather|saveDiary/);
  assert.match(views, /OutfitCanvasStudio|rotate|scale|与整个衣柜比较|OutfitDiary/);
  assert.match(canvasRoute, /layout_json|preview_key|自由创作/);
  assert.match(relationRoute, /companionCounts|suggestedLooks|lastWornAt/);
  assert.match(shoppingRoute, /duplicateScore|potentialWithWardrobe|recommendedSize|降价再买/);
  assert.match(reminderRoute, /evening_enabled|weather_alerts|morning_rerank/);
  assert.match(diaryRoute, /fit_feedback|compliments|recordWear|preference_profiles/);
  assert.match(serverP1, /estimateSize|potentialWithWardrobe|duplicateScore/);
  assert.match(schema, /outfitCards|shoppingAssessments|reminderPreferences|outfitDiaries/);
  assert.match(runtime, /OUTFIT_DIARY_VISION_URL|CREATE TABLE IF NOT EXISTS outfit_cards/);
  assert.match(migration, /shopping_assessments|reminder_preferences|outfit_diaries/);
  assert.match(serviceWorker, /showNotification|notificationclick/);
});

test("ships private photorealistic try-on without a puppet fallback", async () => {
  const [advanced, tryOnRoute, imageRoute, demoAssets, schema, runtime, migration, security, notices] = await Promise.all([
    readFile(new URL("../app/advanced-views.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/virtual-tryon/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/virtual-tryon/image/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/demo-assets.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0007_photo_virtual_tryon.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/security.ts", import.meta.url), "utf8"),
    readFile(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8"),
  ]);
  assert.match(advanced, /PhotoTryOnStudio|上传真人全身照|生成真人试穿效果图|BEFORE \/ AFTER/);
  assert.match(advanced, /FASHN 官方上装样例|许可清晰的测试人物/);
  assert.match(advanced, /不会展示伪造的示意结果|3D 纸样重建、布料模拟和可旋转数字人已移出当前产品主流程/);
  assert.doesNotMatch(advanced, /BodyThreeViewer|ZERO-COST DEMO|ChatGarment 服装网格|生成免费互动穿搭预览/);
  assert.match(tryOnRoute, /api\.fashn\.ai\/v1\/run|tryon-v1\.6|return_base64|reserveModelCall|virtual_tryon/);
  assert.match(tryOnRoute, /person_photo_key|tryon-inputs|tryon-results|FASHN_API_KEY/);
  assert.match(tryOnRoute, /demoGarmentAssetForId|runtime\.ASSETS/);
  assert.match(demoAssets, /fashn-model\.webp|pexels-full-body\.jpg|seed-bottom-denim/);
  assert.match(imageRoute, /WARDROBE_IMAGES|getUserId|privateImageHeaders|mode = 'fashn-vton'/);
  assert.match(schema, /personPhotoKey|providerName|tryonSessions/);
  assert.match(runtime, /FASHN_API_KEY|person_photo_key|provider_name/);
  assert.match(migration, /person_photo_key|person_photo_type|provider_name/);
  assert.match(security, /virtual_tryon/);
  assert.match(notices, /Apache License 2\.0|pre-generated research benchmarks/);
  assert.match(notices, /Virtual try-on test assets|Pexels license|public domain|CC0 1\.0/);
  await access(new URL("../public/demo/vton/people/fashn-model.webp", import.meta.url));
  await access(new URL("../public/demo/vton/garments/fashn-official-garment.webp", import.meta.url));
  await assert.rejects(access(new URL("../app/body-three-viewer.tsx", import.meta.url)));
});

test("ships the P0 daily loop, task review, and wardrobe analytics", async () => {
  const [
    component,
    p0Views,
    calendarRoute,
    styleRoute,
    batchRoute,
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
    readFile(new URL("../app/api/analytics/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/recommendations/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/server-p0.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_daily_loop.sql", import.meta.url), "utf8"),
  ]);

  assert.match(component, /startVoiceInput|planWeek|markPlanWorn|BatchIntakeCenter/);
  assert.match(p0Views, /CalendarPlanner|WardrobeAnalyticsDashboard/);
  assert.match(calendarRoute, /plan_week|weekly_ai|fetchWeatherForecast/);
  assert.match(styleRoute, /requestedWeather|formality|rankOutfits/);
  assert.match(batchRoute, /BATCH_SEGMENT_URL|reanalyzeStoredImage|product_image_url/);
  assert.match(analyticsRoute, /days30|isolatedItems|missingBasics/);
  assert.match(recommendationRoute, /availability_status IN \('available', 'stored'\)/);
  assert.match(serverP0, /wear_events|availability_status = 'worn'/);
  assert.match(schema, /wearEvents|outfitPlans|intakeJobs|intakeItems/);
  assert.match(migration, /idx_wear_events_user_garment_date|idx_outfit_plans_user_date/);
});

test("ships all three product phases, persistence model, and social image", async () => {
  const [component, advanced, schema, recommendationRoute, feedbackRoute, intakeRoute, tryOnRoute, migration] = await Promise.all([
    readFile(new URL("../app/wardrobe-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/advanced-views.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/recommendations/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/feedback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/intake/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/virtual-tryon/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_intake_inspiration_body.sql", import.meta.url), "utf8"),
  ]);

  assert.match(component, /dominantColorAndCutout/);
  assert.doesNotMatch(component, /compositeTryOn|二维组合试穿|tryOnSpace/);
  assert.match(component, /喜欢|拒绝|保存|实际穿着/);
  assert.match(component, /真人 AI 试穿|importProductLink|analyzeIntake/);
  assert.match(advanced, /InspirationLibrary|PreferenceDashboard|PhotoTryOnStudio/);
  assert.match(schema, /garmentSources|inspirations|preferenceProfiles|bodyModels|tryonSessions/);
  assert.match(recommendationRoute, /rankOutfits/);
  assert.match(feedbackRoute, /affinityDelta/);
  assert.match(intakeRoute, /OCR_BARCODE_URL|PRODUCT_IMPORT_URL/);
  assert.match(tryOnRoute, /FASHN_API_KEY|tryon-v1\.6/);
  assert.match(migration, /garment_sources|preference_profiles|body_models/);
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await assert.rejects(access(new URL("../app/_sites-preview/preview.css", import.meta.url)));
  await assert.rejects(access(new URL("../app/api/try-on/route.ts", import.meta.url)));
  await access(projectRoot);
});
