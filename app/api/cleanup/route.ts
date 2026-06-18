import { NextResponse } from "next/server";
import { getStorageProviderName } from "@/lib/fileStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ephemeral-storage cleanup. Deletes uploaded room photos and generated previews
 * older than the TTL from the active storage backend (Supabase Storage or Vercel
 * Blob). Designed to be hit on a schedule (Vercel Cron, or an external 1-minute
 * cron) — it only removes files past the TTL, so an active fit check keeps working.
 *
 * Auth: if CRON_SECRET is set, the caller must send `Authorization: Bearer <CRON_SECRET>`.
 * Vercel Cron sends this header automatically when CRON_SECRET is configured.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const ttlMinutes = Math.max(
    1,
    Number(process.env.STORAGE_TTL_MINUTES ?? process.env.BLOB_TTL_MINUTES ?? "60")
  );
  const cutoff = Date.now() - ttlMinutes * 60_000;
  const provider = getStorageProviderName();

  try {
    if (provider === "supabase") {
      const deleted = await cleanupSupabase(cutoff);
      return NextResponse.json({ provider, deleted, ttlMinutes });
    }
    if (provider === "vercel-blob") {
      const deleted = await cleanupBlob(cutoff);
      return NextResponse.json({ provider, deleted, ttlMinutes });
    }
    return NextResponse.json({ provider, skipped: "No cloud storage configured.", ttlMinutes });
  } catch (err) {
    console.error("Cleanup failed:", err);
    return NextResponse.json(
      { error: "Cleanup failed.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

async function cleanupSupabase(cutoff: number): Promise<number> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "uploads";
  if (!url || !key) throw new Error("Supabase storage env not configured.");

  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const prefix = "uploads";
  const expired: string[] = [];
  const pageSize = 1000;
  let offset = 0;

  // Files are stored under "uploads/<random>.<ext>" within the bucket.
  for (;;) {
    const { data, error } = await sb.storage
      .from(bucket)
      .list(prefix, { limit: pageSize, offset, sortBy: { column: "created_at", order: "asc" } });
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const file of data) {
      const ts = file.created_at ?? file.updated_at;
      if (ts && new Date(ts).getTime() < cutoff) expired.push(`${prefix}/${file.name}`);
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  if (expired.length > 0) {
    const { error } = await sb.storage.from(bucket).remove(expired);
    if (error) throw new Error(error.message);
  }
  return expired.length;
}

async function cleanupBlob(cutoff: number): Promise<number> {
  const { list, del } = await import("@vercel/blob");
  const expired: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "uploads/", limit: 1000, cursor });
    for (const blob of page.blobs) {
      if (new Date(blob.uploadedAt).getTime() < cutoff) expired.push(blob.url);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  if (expired.length > 0) await del(expired);
  return expired.length;
}
