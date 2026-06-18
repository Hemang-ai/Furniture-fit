import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Issues short-lived client upload tokens so the browser can upload the room
 * photo DIRECTLY to Vercel Blob — bypassing the ~4.5 MB serverless request-body
 * limit. Requires a Blob store (BLOB_READ_WRITE_TOKEN) configured for PUBLIC
 * access (the app displays the image and AI providers fetch it by URL).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
        maximumSizeInBytes: 15 * 1024 * 1024,
        addRandomSuffix: true,
      }),
      // Called by Vercel after the upload completes (skipped on localhost).
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload token error." },
      { status: 400 }
    );
  }
}
