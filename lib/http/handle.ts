import "server-only";
import { NextResponse } from "next/server";
import { getRequestContext, type RequestContext } from "@/lib/data";
import { ServiceError } from "@/lib/services/errors";

/** Membungkus route handler: autentikasi, error terstruktur, tanpa bocoran detail internal. */
export async function handle(
  fn: (ctx: RequestContext) => Promise<unknown>,
  successStatus = 200,
): Promise<NextResponse> {
  try {
    const ctx = await getRequestContext();
    const body = await fn(ctx);
    return NextResponse.json(body, {
      status: successStatus,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof ServiceError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, details: err.details ?? null } },
        { status: err.status },
      );
    }
    console.error("[api] unexpected error", err);
    return NextResponse.json(
      { error: { code: "internal_error", message: "Terjadi kesalahan server.", details: null } },
      { status: 500 },
    );
  }
}

export async function readJson(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    throw new ServiceError(415, "unsupported_media_type", "Gunakan application/json.");
  }
  const text = await request.text();
  if (text.length > 50_000) throw new ServiceError(413, "payload_too_large", "Payload terlalu besar.");
  try {
    return JSON.parse(text);
  } catch {
    throw new ServiceError(400, "invalid_json", "JSON tidak valid.");
  }
}
