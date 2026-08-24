/** Cloudflare Worker entry point for the vinext-starter template. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: unknown;
  WARDROBE_IMAGES: unknown;
  IMAGES?: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  MAX_REQUEST_BYTES?: string;
  AUTH_PROVIDER?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_GOOGLE_ENABLED?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type SupabaseIdentity = {
  userId: string;
  email: string;
  fullName: string | null;
  expiresAt: number | null;
};

const AUTH_COOKIE = "muse_supabase_access_token";
const supabaseClients = new Map<string, SupabaseClient>();
const identityHeaders = [
  "oai-authenticated-user-id",
  "oai-authenticated-user-email",
  "oai-authenticated-user-full-name",
  "oai-authenticated-user-full-name-encoding",
];
const runtimeAuthHeaders = [
  "x-muse-auth-provider",
  "x-muse-supabase-url",
  "x-muse-supabase-publishable-key",
  "x-muse-supabase-google-enabled",
];

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null;
}

function cookieToken(request: Request) {
  const value = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_COOKIE}=`))?.slice(AUTH_COOKIE.length + 1);
  if (!value) return null;
  try { return decodeURIComponent(value); } catch { return null; }
}

function supabaseClient(env: Env) {
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return null;
  const cacheKey = `${url}|${key}`;
  const cached = supabaseClients.get(cacheKey);
  if (cached) return cached;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  supabaseClients.set(cacheKey, client);
  return client;
}

async function verifySupabaseToken(env: Env, token: string): Promise<SupabaseIdentity | null> {
  const client = supabaseClient(env);
  if (!client) return null;
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims) return null;
  const claims = data.claims as Record<string, unknown>;
  if (typeof claims.sub !== "string" || !claims.sub) return null;
  const metadata = claims.user_metadata && typeof claims.user_metadata === "object"
    ? claims.user_metadata as Record<string, unknown>
    : {};
  const email = typeof claims.email === "string" ? claims.email : "";
  const fullName = [metadata.full_name, metadata.name]
    .find((value): value is string => typeof value === "string" && Boolean(value.trim())) ?? null;
  return {
    userId: claims.sub,
    email,
    fullName,
    expiresAt: typeof claims.exp === "number" ? claims.exp : null,
  };
}

function withRuntimeAuth(request: Request, env: Env, identity: SupabaseIdentity | null, usesSupabase: boolean) {
  const headers = new Headers(request.headers);
  for (const name of identityHeaders) headers.delete(name);
  for (const name of runtimeAuthHeaders) headers.delete(name);
  headers.delete("authorization");
  if (usesSupabase) {
    headers.set("x-muse-auth-provider", "supabase");
    if (env.SUPABASE_URL) headers.set("x-muse-supabase-url", env.SUPABASE_URL);
    if (env.SUPABASE_PUBLISHABLE_KEY) headers.set("x-muse-supabase-publishable-key", env.SUPABASE_PUBLISHABLE_KEY);
    headers.set("x-muse-supabase-google-enabled", env.SUPABASE_GOOGLE_ENABLED?.toLowerCase() === "true" ? "true" : "false");
  }
  if (usesSupabase && identity) {
    headers.set("oai-authenticated-user-id", identity.userId);
    headers.set("oai-authenticated-user-email", identity.email);
    if (identity.fullName) {
      headers.set("oai-authenticated-user-full-name", encodeURIComponent(identity.fullName));
      headers.set("oai-authenticated-user-full-name-encoding", "percent-encoded-utf-8");
    }
  }
  return new Request(request, { headers });
}

function authCookie(token: string, identity: SupabaseIdentity, secure: boolean) {
  const now = Math.floor(Date.now() / 1000);
  const maxAge = identity.expiresAt ? Math.max(1, Math.min(3600, identity.expiresAt - now)) : 3600;
  return `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

function clearAuthCookie(secure: boolean) {
  return `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

function authSessionResponse(request: Request, env: Env, isLocal: boolean) {
  if (request.method === "DELETE") {
    return Promise.resolve(new Response(null, {
      status: 204,
      headers: { "set-cookie": clearAuthCookie(!isLocal), "cache-control": "no-store", "clear-site-data": '"cache", "cookies", "storage"' },
    }));
  }
  if (request.method !== "POST") {
    return Promise.resolve(Response.json({ error: "Method not allowed" }, { status: 405, headers: { allow: "POST, DELETE" } }));
  }
  const token = bearerToken(request);
  if (!token) return Promise.resolve(Response.json({ error: "缺少登录令牌", code: "AUTH_REQUIRED" }, { status: 401 }));
  return verifySupabaseToken(env, token).then((identity) => {
    if (!identity) return Response.json({ error: "登录令牌无效或已过期", code: "INVALID_TOKEN" }, { status: 401, headers: { "cache-control": "no-store" } });
    return Response.json(
      { authenticated: true, user: { id: identity.userId, email: identity.email } },
      { headers: { "set-cookie": authCookie(token, identity, !isLocal), "cache-control": "no-store" } },
    );
  });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
    const isApi = url.pathname.startsWith("/api/");

    if (isApi && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const origin = request.headers.get("origin");
      if (!isLocal && origin !== url.origin) {
        return Response.json(
          { error: "请求来源校验失败", code: "INVALID_ORIGIN" },
          { status: 403, headers: { "cache-control": "no-store" } },
        );
      }
      const contentLength = Number(request.headers.get("content-length") ?? 0);
      const maxRequestBytes = Number(env.MAX_REQUEST_BYTES ?? 25 * 1024 * 1024);
      if (Number.isFinite(contentLength) && contentLength > maxRequestBytes) {
        return Response.json(
          { error: "本次上传内容过大", code: "REQUEST_TOO_LARGE" },
          { status: 413, headers: { "cache-control": "no-store" } },
        );
      }
    }

    const usesSupabase = env.AUTH_PROVIDER?.toLowerCase() === "supabase";
    if (usesSupabase && url.pathname === "/api/auth/session") {
      if (!supabaseClient(env)) {
        return Response.json(
          { error: "Supabase 登录服务尚未完成配置", code: "AUTH_NOT_CONFIGURED" },
          { status: 503, headers: { "cache-control": "no-store" } },
        );
      }
      return authSessionResponse(request, env, isLocal);
    }

    if (usesSupabase) {
      const token = bearerToken(request) ?? cookieToken(request);
      const identity = token ? await verifySupabaseToken(env, token) : null;
      request = withRuntimeAuth(request, env, identity, true);
    } else {
      const headers = new Headers(request.headers);
      for (const name of runtimeAuthHeaders) headers.delete(name);
      request = new Request(request, { headers });
    }

    const userId = request.headers.get("oai-authenticated-user-id");
    if (isApi && !isLocal && !userId) {
      return Response.json(
        { error: "请先登录后使用个人衣柜功能", code: "AUTH_REQUIRED" },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: env.IMAGES ? async (body, { width, format, quality }) => {
          const result = await env.IMAGES!.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        } : undefined,
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("x-content-type-options", "nosniff");
    headers.set("referrer-policy", "strict-origin-when-cross-origin");
    headers.set("permissions-policy", "camera=(), microphone=(self), geolocation=(self)");
    headers.set("content-security-policy", "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
    headers.set("x-frame-options", "DENY");
    if (isApi) headers.set("cache-control", "no-store");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};

export default worker;
