import { runtime } from "@/db/runtime";

export async function POST(request: Request) {
  const form = await request.formData();
  const person = form.get("person");
  const garment = form.get("garment");
  const category = String(form.get("category") || "tops");
  if (!(person instanceof File) || !(garment instanceof File)) {
    return Response.json({ mode: "composite" });
  }

  if (!runtime.FASHN_VTON_URL) {
    return Response.json({ mode: "composite" });
  }

  try {
    const upstream = new FormData();
    upstream.set("person", person, person.name);
    upstream.set("garment", garment, garment.name);
    upstream.set("category", category);
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
    return Response.json({ mode: "composite" });
  }
}
