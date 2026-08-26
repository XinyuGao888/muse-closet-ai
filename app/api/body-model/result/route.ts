import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import { privateImageHeaders } from "@/lib/security";

export const dynamic = "force-dynamic";

function privateModelHeaders(contentType: string) {
  const safeContentType = ["model/gltf-binary", "application/octet-stream"].includes(contentType)
    ? contentType
    : "application/octet-stream";
  return {
    "content-type": safeContentType,
    "cache-control": "private, no-store, max-age=0",
    "content-disposition": "inline",
    "x-content-type-options": "nosniff",
  };
}

export async function GET(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const kind = url.searchParams.get("kind") === "render" ? "render" : "mesh";
  if (!id) return new Response("Not found", { status: 404 });

  const row = await runtime.DB.prepare(
    `SELECT result_key AS resultKey, render_key AS renderKey
    FROM tryon_sessions WHERE id = ? AND user_id = ?`,
  ).bind(id, userId).first<{ resultKey: string | null; renderKey: string | null }>();
  const key = kind === "render" ? row?.renderKey : row?.resultKey;
  if (!key) return new Response("Not found", { status: 404 });
  const object = await runtime.WARDROBE_IMAGES.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const contentType = object.httpMetadata?.contentType
    ?? (kind === "render" ? "image/png" : "model/gltf-binary");
  return new Response(object.body, {
    headers: kind === "render" ? privateImageHeaders(contentType) : privateModelHeaders(contentType),
  });
}
