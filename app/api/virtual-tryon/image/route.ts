import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import { privateImageHeaders } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const kind = url.searchParams.get("kind") === "person" ? "person" : "result";
  if (!id) return new Response("Not found", { status: 404 });
  const row = await runtime.DB.prepare(
    `SELECT result_key AS resultKey, person_photo_key AS personPhotoKey
     FROM tryon_sessions WHERE id = ? AND user_id = ?
     AND mode IN ('tryoncloud-vton', 'fashn-vton')`,
  ).bind(id, userId).first<{ resultKey: string | null; personPhotoKey: string | null }>();
  const key = kind === "person" ? row?.personPhotoKey : row?.resultKey;
  if (!key) return new Response("Not found", { status: 404 });
  const object = await runtime.WARDROBE_IMAGES.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: privateImageHeaders(object.httpMetadata?.contentType ?? "image/jpeg"),
  });
}
