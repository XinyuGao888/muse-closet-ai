import { ensureSchema, getUserId, runtime } from "@/db/runtime";

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
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? row.imageType ?? "image/png",
      "cache-control": "private, max-age=3600",
    },
  });
}
