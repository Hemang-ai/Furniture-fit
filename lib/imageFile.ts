/**
 * Helpers for reading images (local public paths or remote URLs) into the
 * base64 / data-URL forms that the OpenAI and Gemini APIs expect.
 */
import { promises as fs } from "fs";
import path from "path";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

export interface EncodedImage {
  base64: string;
  mimeType: string;
  dataUrl: string;
  buffer: Buffer;
}

/** Read an image stored under /public (e.g. "/uploads/abc.png"). */
export async function readPublicImage(publicPath: string): Promise<EncodedImage> {
  const rel = publicPath.replace(/^\/+/, "");
  const abs = path.join(process.cwd(), "public", rel);
  const buffer = await fs.readFile(abs);
  const ext = path.extname(abs).toLowerCase();
  const mimeType = MIME_BY_EXT[ext] ?? "image/png";
  const base64 = buffer.toString("base64");
  return { base64, mimeType, dataUrl: `data:${mimeType};base64,${base64}`, buffer };
}

/** Max bytes we will inline into an AI request. */
const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;

/** Download a remote image URL into the encoded forms. */
export async function fetchImageAsEncoded(url: string): Promise<EncodedImage> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "image/png";
  // Guard: users sometimes paste a product PAGE url instead of an image url.
  // Inlining an HTML page as "image data" blows the model's token limit.
  if (!mimeType.startsWith("image/")) {
    throw new Error(`URL did not return an image (got ${mimeType}).`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_INLINE_IMAGE_BYTES) {
    throw new Error(`Image too large to inline (${buffer.length} bytes).`);
  }
  const base64 = buffer.toString("base64");
  return { base64, mimeType, dataUrl: `data:${mimeType};base64,${base64}`, buffer };
}

/**
 * Resolve an image reference (public path OR http(s) URL) to an encoded image.
 * Returns null on failure so callers can degrade gracefully.
 */
export async function resolveImage(ref: string): Promise<EncodedImage | null> {
  try {
    if (/^https?:\/\//i.test(ref)) return await fetchImageAsEncoded(ref);
    return await readPublicImage(ref);
  } catch {
    return null;
  }
}
