import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import { demoGarmentAssetForId } from "@/lib/demo-assets";
import { privateImageHeaders } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return new Response("Not found", { status: 404 });

  const row = await runtime.DB.prepare(
    "SELECT image_key AS imageKey, image_type AS imageType FROM garments WHERE id = ? AND user_id = ?",
  )
    .bind(id, userId)
    .first<{ imageKey: string | null; imageType: string | null }>();
  if (!row?.imageKey) return new Response("Not found", { status: 404 });

  const object = await runtime.WARDROBE_IMAGES.get(row.imageKey);
  if (!object) {
    const fallbackPath = demoGarmentAssetForId(id);
    if (!fallbackPath) return new Response("Not found", { status: 404 });
    const asset = await runtime.ASSETS.fetch(new Request(new URL(fallbackPath, request.url)));
    if (!asset.ok || !asset.body) return new Response("Not found", { status: 404 });
    return new Response(asset.body, {
      headers: privateImageHeaders(asset.headers.get("content-type") ?? "image/jpeg"),
    });
  }
  return new Response(object.body, {
    headers: privateImageHeaders(object.httpMetadata?.contentType ?? row.imageType ?? "image/png"),
  });
}
