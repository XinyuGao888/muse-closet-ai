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
  assert.match(security, /reserveUpload|reserveModelCall|validateImageFile|GLOBAL_DAILY_MODEL_BUDGET_MICROS|GLOBAL_MODEL_BUDGET_EXCEEDED/);
  assert.match(schema, /appUsers|usageDaily|usageEvents/);
  assert.match(runtime, /CREATE TABLE IF NOT EXISTS app_users|CREATE TABLE IF NOT EXISTS usage_daily/);
  assert.match(migration, /usage_events|idx_intake_items_user_job_status/);
  assert.match(wardrobeImage, /privateImageHeaders/);
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

test("ships the AI 3D body twin and learnable trend-style mapping", async () => {
  const [advanced, bodyRoute, imageRoute, styleRoute, types, schema, runtime, migration] = await Promise.all([
    readFile(new URL("../app/advanced-views.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/body-model/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/body-model/image/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/style-twin/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/phase-two-three.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0004_ai_3d_style_twin.sql", import.meta.url), "utf8"),
  ]);
  assert.match(advanced, /AI 照片建模|参数生成|Style Twin|在人体上试穿/);
  assert.match(bodyRoute, /front_photo_key|profile_confidence|removePhotos|styleSessionId/);
  assert.match(imageRoute, /WARDROBE_IMAGES|getUserId|private/);
  assert.match(styleRoute, /bodyAdvice|garmentScore|STYLE_TWIN_URL|style_twin_sessions/);
  assert.match(types, /bodyShape|skinTone|hairStyle|StyleTwinLook/);
  assert.match(schema, /styleTwinSessions|frontPhotoKey|profileConfidence/);
  assert.match(runtime, /STYLE_TWIN_URL|idx_style_twin_user_body/);
  assert.match(migration, /style_twin_sessions|front_photo_key|PRAGMA optimize/);
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
