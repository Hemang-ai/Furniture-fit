import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ephemeral-storage cleanup. Deletes uploaded room photos and generated previews
 * from Vercel Blob that are older than BLOB_TTL_MINUTES (default 60). Designed to
 * be hit on a schedule (Vercel Cron, or an external 1-minute cron) — it only
 * removes blobs past the TTL, so an active fit check (view + preview generation)
 * keeps working while old files are reaped quickly.
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

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ skipped: "No Blob store configured (BLOB_READ_WRITE_TOKEN unset)." });
  }

  const ttlMinutes = Math.max(1, Number(process.env.BLOB_TTL_MINUTES ?? "60"));
  const cutoff = Date.now() - ttlMinutes * 60_000;

  try {
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

    if (expired.length > 0) {
      // del accepts an array of URLs.
      await del(expired);
    }

    return NextResponse.json({ deleted: expired.length, ttlMinutes });
  } catch (err) {
    console.error("Cleanup failed:", err);
    return NextResponse.json(
      { error: "Cleanup failed.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
