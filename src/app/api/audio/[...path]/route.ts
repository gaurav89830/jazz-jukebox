import { NextRequest } from "next/server";
import { audioBaseUrl } from "@/config/player";

const CACHE_CONTROL = "public, max-age=31536000, immutable";

function buildUpstreamUrl(pathSegments: string[]) {
  const filePath = pathSegments.map(decodeURIComponent).join("/");
  return `${audioBaseUrl}/${filePath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function passthroughHeaders(upstream: Response) {
  const headers = new Headers();
  headers.set("Cache-Control", CACHE_CONTROL);
  headers.set("Accept-Ranges", "bytes");

  for (const key of [
    "Content-Type",
    "Content-Length",
    "Content-Range",
    "ETag",
    "Last-Modified",
  ]) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }

  return headers;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (!path.length) {
    return new Response("Not found", { status: 404 });
  }

  const upstreamHeaders = new Headers();
  const range = request.headers.get("range");
  if (range) upstreamHeaders.set("Range", range);

  const upstream = await fetch(buildUpstreamUrl(path), {
    headers: upstreamHeaders,
    next: { revalidate: 60 * 60 * 24 * 30 },
  });

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(upstream.statusText, { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: passthroughHeaders(upstream),
  });
}
