import { NextResponse } from "next/server";
import { getFileStorage } from "@/lib/fileStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided under 'file'." }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "Uploaded file is empty." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File is too large (max 10 MB)." }, { status: 413 });
    }
    if (file.type && !ALLOWED.includes(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Use PNG, JPG, WEBP, or GIF." },
        { status: 415 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const path = await getFileStorage().save({
      buffer,
      filename: file.name || "room.png",
      contentType: file.type || undefined,
    });

    return NextResponse.json({ path });
  } catch (err) {
    console.error("Upload failed:", err);
    const raw = err instanceof Error ? err.message : String(err);
    let friendly = "Upload failed. Please try again.";
    if (/private store|public access/i.test(raw)) {
      friendly =
        "The Vercel Blob store is set to PRIVATE. Recreate it with public access (Storage → Blob), then redeploy.";
    } else if (/EROFS|read-only|ENOENT/i.test(raw)) {
      friendly =
        "Storage is not writable here. Configure a Vercel Blob store (BLOB_READ_WRITE_TOKEN) for production.";
    }
    return NextResponse.json({ error: friendly }, { status: 500 });
  }
}
