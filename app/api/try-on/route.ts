import { runtime } from "@/db/runtime";

export async function POST(request: Request) {
  const form = await request.formData();
  const person = form.get("person");
  const legacyGarment = form.get("garment");
  const garments = form.getAll("garments").filter((item): item is File => item instanceof File);
  if (legacyGarment instanceof File && garments.length === 0) garments.push(legacyGarment);
  const category = String(form.get("category") || "tops");
  if (!(person instanceof File) || garments.length === 0) {
    return Response.json({ mode: "composite", itemCount: garments.length });
  }

  if (!runtime.FASHN_VTON_URL) {
    return Response.json({ mode: "composite", itemCount: garments.length });
  }

  try {
    const upstream = new FormData();
    upstream.set("person", person, person.name);
    garments.forEach((garment) => upstream.append("garments", garment, garment.name));
    upstream.set("garment", garments[0], garments[0].name);
    upstream.set("category", category);
    upstream.set("mode", garments.length > 1 ? "multi" : "single");
    const response = await fetch(runtime.FASHN_VTON_URL, {
      method: "POST",
      headers: runtime.FASHN_VTON_TOKEN
        ? { authorization: `Bearer ${runtime.FASHN_VTON_TOKEN}` }
        : undefined,
      body: upstream,
    });
    if (!response.ok) throw new Error("VTON upstream failed");
    return new Response(response.body, {
      headers: { "content-type": response.headers.get("content-type") ?? "image/png" },
    });
  } catch {
    return Response.json({ mode: "composite", itemCount: garments.length });
  }
}
