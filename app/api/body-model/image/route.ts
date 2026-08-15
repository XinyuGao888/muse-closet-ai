import { ensureSchema, getUserId, runtime } from "@/db/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const view = url.searchParams.get("view") === "side" ? "side" : "front";
  if (!id) return new Response("Not found", { status: 404 });
  const row = await runtime.DB.prepare(
    `SELECT front_photo_key AS frontPhotoKey, side_photo_key AS sidePhotoKey
    FROM body_models WHERE id = ? AND user_id = ?`,
  ).bind(id, userId).first<{ frontPhotoKey: string | null; sidePhotoKey: string | null }>();
  const key = view === "side" ? row?.sidePhotoKey : row?.frontPhotoKey;
  if (!key) return new Response("Not found", { status: 404 });
  const object = await runtime.WARDROBE_IMAGES.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "image/jpeg",
      "cache-control": "private, max-age=1800",
    },
  });
}
