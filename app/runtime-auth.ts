import { headers } from "next/headers";
import type { SupabasePublicConfig } from "@/lib/auth-provider";

export async function runtimeAuth(): Promise<{ provider: "sites" } | { provider: "supabase"; config: SupabasePublicConfig | null }> {
  const requestHeaders = await headers();
  if (requestHeaders.get("x-muse-auth-provider") !== "supabase") return { provider: "sites" };
  const url = requestHeaders.get("x-muse-supabase-url")?.trim();
  const publishableKey = requestHeaders.get("x-muse-supabase-publishable-key")?.trim();
  return {
    provider: "supabase",
    config: url && publishableKey ? {
      url,
      publishableKey,
      googleEnabled: requestHeaders.get("x-muse-supabase-google-enabled") === "true",
    } : null,
  };
}
