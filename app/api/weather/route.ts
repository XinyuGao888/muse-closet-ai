import { fetchWeatherForecast } from "@/lib/server-p0";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const latitude = Number(url.searchParams.get("latitude"));
  const longitude = Number(url.searchParams.get("longitude"));
  const forecast = await fetchWeatherForecast({
    location: url.searchParams.get("location"),
    latitude: Number.isFinite(latitude) ? latitude : undefined,
    longitude: Number.isFinite(longitude) ? longitude : undefined,
    days: Number(url.searchParams.get("days") || 10),
  });
  return Response.json({ forecast });
}
