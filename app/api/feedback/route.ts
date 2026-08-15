import { ensureSchema, getUserId, runtime } from "@/db/runtime";
import { recordWear } from "@/lib/server-p0";

const affinityDelta = {
  like: 1.5,
  reject: -2.5,
  save: 2.5,
  wear: 4,
} as const;

export async function POST(request: Request) {
  await ensureSchema();
  const userId = getUserId(request);
  const payload = (await request.json()) as {
    outfitId?: string;
    action?: keyof typeof affinityDelta;
    itemIds?: string[];
  };
  if (!payload.outfitId || !payload.action || !Array.isArray(payload.itemIds)) {
    return Response.json({ error: "反馈信息不完整" }, { status: 400 });
  }

  const delta = affinityDelta[payload.action];
  const statements = [
    runtime.DB.prepare(
      "INSERT INTO feedback (id, user_id, outfit_id, action, item_ids) VALUES (?, ?, ?, ?, ?)",
    ).bind(
      crypto.randomUUID(),
      userId,
      payload.outfitId,
      payload.action,
      JSON.stringify(payload.itemIds),
    ),
    ...payload.itemIds.map((id) =>
      runtime.DB.prepare(
        `UPDATE garments SET affinity = affinity + ?,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?`,
      ).bind(delta, id, userId),
    ),
  ];
  if (payload.action === "save") {
    statements.push(
      runtime.DB.prepare(
        "UPDATE outfits SET saved = 1 WHERE id = ? AND user_id = ?",
      ).bind(payload.outfitId, userId),
    );
  }
  await runtime.DB.batch(statements);
  if (payload.action === "wear") {
    await recordWear(userId, payload.itemIds, { outfitId: payload.outfitId, source: "outfit", affinityDelta: 0 });
  }
  return Response.json({ ok: true, learned: delta });
}
