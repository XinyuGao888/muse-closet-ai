import { env } from "cloudflare:workers";

type RunResult = { success: boolean };
type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  run: () => Promise<RunResult>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<{ results: T[] }>;
};

type D1Binding = {
  prepare: (query: string) => D1Statement;
  batch: (statements: D1Statement[]) => Promise<RunResult[]>;
};

type R2ObjectBody = {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
};

type R2Binding = {
  put: (
    key: string,
    value: ArrayBuffer | ReadableStream,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>;
  get: (key: string) => Promise<R2ObjectBody | null>;
  delete: (key: string) => Promise<void>;
};

type RuntimeBindings = {
  DB: D1Binding;
  WARDROBE_IMAGES: R2Binding;
  FASHION_SIGLIP_URL?: string;
  FASHION_SIGLIP_TOKEN?: string;
  FASHN_VTON_URL?: string;
  FASHN_VTON_TOKEN?: string;
  OCR_BARCODE_URL?: string;
  OCR_BARCODE_TOKEN?: string;
  PRODUCT_IMPORT_URL?: string;
  PRODUCT_IMPORT_TOKEN?: string;
  SAM3D_BODY_URL?: string;
  SAM3D_BODY_TOKEN?: string;
  MHR_URL?: string;
  MHR_TOKEN?: string;
  BATCH_SEGMENT_URL?: string;
  BATCH_SEGMENT_TOKEN?: string;
  OUTFIT_DIARY_VISION_URL?: string;
  OUTFIT_DIARY_VISION_TOKEN?: string;
  STYLE_TWIN_URL?: string;
  STYLE_TWIN_TOKEN?: string;
};

export const runtime = env as unknown as RuntimeBindings;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS garments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    color TEXT NOT NULL,
    pattern TEXT NOT NULL DEFAULT '纯色',
    material TEXT NOT NULL DEFAULT '待确认',
    season TEXT NOT NULL DEFAULT '四季',
    style_tags TEXT NOT NULL DEFAULT '[]',
    occasion_tags TEXT NOT NULL DEFAULT '[]',
    image_key TEXT,
    image_type TEXT,
    source_type TEXT NOT NULL DEFAULT 'ai_guess',
    confidence REAL NOT NULL DEFAULT 0.72,
    favorite INTEGER NOT NULL DEFAULT 0,
    wear_count INTEGER NOT NULL DEFAULT 0,
    affinity REAL NOT NULL DEFAULT 0,
    availability_status TEXT NOT NULL DEFAULT 'available',
    storage_location TEXT,
    last_worn_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS outfits (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    occasion TEXT NOT NULL,
    weather TEXT NOT NULL,
    item_ids TEXT NOT NULL,
    score REAL NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT '',
    saved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    outfit_id TEXT NOT NULL,
    action TEXT NOT NULL,
    item_ids TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS garment_sources (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    garment_id TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    brand TEXT,
    product_code TEXT,
    product_url TEXT,
    raw_text TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS inspirations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    creator TEXT NOT NULL,
    occasion TEXT NOT NULL,
    style_tags TEXT NOT NULL DEFAULT '[]',
    item_categories TEXT NOT NULL DEFAULT '[]',
    palette TEXT NOT NULL DEFAULT '[]',
    note TEXT NOT NULL DEFAULT '',
    saved INTEGER NOT NULL DEFAULT 0,
    used_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS preference_profiles (
    user_id TEXT PRIMARY KEY,
    explicit_styles TEXT NOT NULL DEFAULT '[]',
    blocked_colors TEXT NOT NULL DEFAULT '[]',
    fit_preference TEXT NOT NULL DEFAULT '标准',
    exploration INTEGER NOT NULL DEFAULT 35,
    total_signals INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS body_models (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    measurements TEXT NOT NULL DEFAULT '{}',
    mesh_url TEXT,
    render_url TEXT,
    front_photo_key TEXT,
    side_photo_key TEXT,
    profile_confidence REAL NOT NULL DEFAULT 0.8,
    model_mode TEXT NOT NULL DEFAULT 'parametric',
    status TEXT NOT NULL DEFAULT 'ready',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS tryon_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    body_model_id TEXT,
    mode TEXT NOT NULL,
    item_ids TEXT NOT NULL DEFAULT '[]',
    result_url TEXT,
    result_key TEXT,
    status TEXT NOT NULL DEFAULT 'ready',
    progress INTEGER NOT NULL DEFAULT 100,
    favorite INTEGER NOT NULL DEFAULT 0,
    previous_session_id TEXT,
    error_message TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS wear_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    garment_id TEXT NOT NULL,
    outfit_id TEXT,
    plan_id TEXT,
    worn_date TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS outfit_plans (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_date TEXT NOT NULL,
    outfit_id TEXT,
    name TEXT NOT NULL,
    item_ids TEXT NOT NULL DEFAULT '[]',
    occasion TEXT NOT NULL DEFAULT '日常',
    weather_label TEXT NOT NULL DEFAULT '',
    temperature REAL NOT NULL DEFAULT 18,
    weather_code INTEGER NOT NULL DEFAULT 0,
    location TEXT NOT NULL DEFAULT '伦敦',
    source TEXT NOT NULL DEFAULT 'manual',
    status TEXT NOT NULL DEFAULT 'planned',
    worn_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS intake_jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    total_items INTEGER NOT NULL DEFAULT 0,
    completed_items INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS intake_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    draft_json TEXT NOT NULL DEFAULT '{}',
    original_key TEXT,
    cutout_key TEXT,
    product_image_url TEXT,
    selected_cover TEXT NOT NULL DEFAULT 'cutout',
    error_message TEXT,
    garment_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS outfit_cards (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    item_ids TEXT NOT NULL DEFAULT '[]',
    layout_json TEXT NOT NULL DEFAULT '[]',
    preview_key TEXT,
    occasion TEXT NOT NULL DEFAULT '自由搭配',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS shopping_assessments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    candidate_json TEXT NOT NULL DEFAULT '{}',
    decision TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    analysis_json TEXT NOT NULL DEFAULT '{}',
    image_key TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS reminder_preferences (
    user_id TEXT PRIMARY KEY,
    location_label TEXT NOT NULL DEFAULT '当前位置',
    latitude REAL,
    longitude REAL,
    evening_enabled INTEGER NOT NULL DEFAULT 1,
    evening_time TEXT NOT NULL DEFAULT '21:00',
    weather_alerts INTEGER NOT NULL DEFAULT 1,
    morning_rerank INTEGER NOT NULL DEFAULT 1,
    notification_permission TEXT NOT NULL DEFAULT 'default',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS outfit_diaries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_id TEXT,
    outfit_id TEXT,
    tryon_session_id TEXT,
    item_ids TEXT NOT NULL DEFAULT '[]',
    photo_key TEXT,
    caption TEXT NOT NULL DEFAULT '',
    fit_feedback TEXT NOT NULL DEFAULT '合身',
    comfort_rating INTEGER NOT NULL DEFAULT 4,
    compliments INTEGER NOT NULL DEFAULT 0,
    difference_notes TEXT NOT NULL DEFAULT '',
    ai_notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS style_twin_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    inspiration_id TEXT NOT NULL,
    body_model_id TEXT NOT NULL,
    inspiration_title TEXT NOT NULL,
    creator TEXT NOT NULL,
    occasion TEXT NOT NULL,
    style_tags TEXT NOT NULL DEFAULT '[]',
    item_ids TEXT NOT NULL DEFAULT '[]',
    score INTEGER NOT NULL DEFAULT 0,
    formula TEXT NOT NULL DEFAULT '',
    body_note TEXT NOT NULL DEFAULT '',
    color_note TEXT NOT NULL DEFAULT '',
    saved INTEGER NOT NULL DEFAULT 0,
    feedback TEXT,
    tryon_session_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS idx_garments_user_category ON garments(user_id, category)",
  "CREATE INDEX IF NOT EXISTS idx_garments_user_favorite ON garments(user_id, favorite)",
  "CREATE INDEX IF NOT EXISTS idx_outfits_user_created ON outfits(user_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_feedback_user_action ON feedback(user_id, action)",
  "CREATE INDEX IF NOT EXISTS idx_garment_sources_user_garment ON garment_sources(user_id, garment_id)",
  "CREATE INDEX IF NOT EXISTS idx_garment_sources_user_code ON garment_sources(user_id, product_code)",
  "CREATE INDEX IF NOT EXISTS idx_inspirations_user_saved ON inspirations(user_id, saved)",
  "CREATE INDEX IF NOT EXISTS idx_body_models_user_created ON body_models(user_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_tryon_sessions_user_created ON tryon_sessions(user_id, created_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_wear_events_user_garment_date ON wear_events(user_id, garment_id, worn_date)",
  "CREATE INDEX IF NOT EXISTS idx_wear_events_user_date ON wear_events(user_id, worn_date)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_outfit_plans_user_date ON outfit_plans(user_id, plan_date)",
  "CREATE INDEX IF NOT EXISTS idx_outfit_plans_user_month ON outfit_plans(user_id, plan_date)",
  "CREATE INDEX IF NOT EXISTS idx_intake_jobs_user_created ON intake_jobs(user_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_intake_items_job_status ON intake_items(job_id, status)",
  "CREATE INDEX IF NOT EXISTS idx_outfit_cards_user_created ON outfit_cards(user_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_shopping_assessments_user_created ON shopping_assessments(user_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_outfit_diaries_user_created ON outfit_diaries(user_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_outfit_diaries_plan ON outfit_diaries(user_id, plan_id)",
  "CREATE INDEX IF NOT EXISTS idx_style_twin_user_created ON style_twin_sessions(user_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_style_twin_user_body ON style_twin_sessions(user_id, body_model_id)",
  "PRAGMA optimize",
];

let schemaReady: Promise<void> | null = null;

export async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await runtime.DB.batch(schemaStatements.map((statement) => runtime.DB.prepare(statement)));
      const garmentColumns = await runtime.DB.prepare("PRAGMA table_info(garments)").all<{ name: string }>();
      const garmentNames = new Set(garmentColumns.results.map((column) => column.name));
      const tryonColumns = await runtime.DB.prepare("PRAGMA table_info(tryon_sessions)").all<{ name: string }>();
      const tryonNames = new Set(tryonColumns.results.map((column) => column.name));
      const bodyColumns = await runtime.DB.prepare("PRAGMA table_info(body_models)").all<{ name: string }>();
      const bodyNames = new Set(bodyColumns.results.map((column) => column.name));
      const upgrades: D1Statement[] = [];
      if (!garmentNames.has("availability_status")) upgrades.push(runtime.DB.prepare("ALTER TABLE garments ADD COLUMN availability_status TEXT NOT NULL DEFAULT 'available'"));
      if (!garmentNames.has("storage_location")) upgrades.push(runtime.DB.prepare("ALTER TABLE garments ADD COLUMN storage_location TEXT"));
      if (!garmentNames.has("last_worn_at")) upgrades.push(runtime.DB.prepare("ALTER TABLE garments ADD COLUMN last_worn_at TEXT"));
      if (!tryonNames.has("result_key")) upgrades.push(runtime.DB.prepare("ALTER TABLE tryon_sessions ADD COLUMN result_key TEXT"));
      if (!tryonNames.has("progress")) upgrades.push(runtime.DB.prepare("ALTER TABLE tryon_sessions ADD COLUMN progress INTEGER NOT NULL DEFAULT 100"));
      if (!tryonNames.has("favorite")) upgrades.push(runtime.DB.prepare("ALTER TABLE tryon_sessions ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0"));
      if (!tryonNames.has("previous_session_id")) upgrades.push(runtime.DB.prepare("ALTER TABLE tryon_sessions ADD COLUMN previous_session_id TEXT"));
      if (!tryonNames.has("error_message")) upgrades.push(runtime.DB.prepare("ALTER TABLE tryon_sessions ADD COLUMN error_message TEXT"));
      if (!tryonNames.has("updated_at")) upgrades.push(runtime.DB.prepare("ALTER TABLE tryon_sessions ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''"));
      if (!bodyNames.has("front_photo_key")) upgrades.push(runtime.DB.prepare("ALTER TABLE body_models ADD COLUMN front_photo_key TEXT"));
      if (!bodyNames.has("side_photo_key")) upgrades.push(runtime.DB.prepare("ALTER TABLE body_models ADD COLUMN side_photo_key TEXT"));
      if (!bodyNames.has("profile_confidence")) upgrades.push(runtime.DB.prepare("ALTER TABLE body_models ADD COLUMN profile_confidence REAL NOT NULL DEFAULT 0.8"));
      if (upgrades.length) await runtime.DB.batch(upgrades);
      await runtime.DB.prepare("PRAGMA optimize").run();
    })();
  }
  return schemaReady;
}

export function getUserId(request: Request) {
  return request.headers.get("oai-authenticated-user-id") ?? "demo-user";
}
