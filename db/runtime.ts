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
    status TEXT NOT NULL DEFAULT 'ready',
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
  "PRAGMA optimize",
];

let schemaReady: Promise<void> | null = null;

export async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = runtime.DB.batch(
      schemaStatements.map((statement) => runtime.DB.prepare(statement)),
    ).then(() => undefined);
  }
  return schemaReady;
}

export function getUserId(request: Request) {
  return request.headers.get("oai-authenticated-user-id") ?? "demo-user";
}
