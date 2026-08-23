/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: unknown;
  WARDROBE_IMAGES: unknown;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  MAX_REQUEST_BYTES?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
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
    const userId = request.headers.get("oai-authenticated-user-id");

    if (isApi && !isLocal && !userId) {
      return Response.json(
        { error: "请先登录后使用个人衣柜功能", code: "AUTH_REQUIRED" },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }

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

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
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
