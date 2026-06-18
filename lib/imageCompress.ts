/**
 * Browser-side image downscaling/compression. Shrinks large phone photos before
 * upload so they comfortably fit the serverless request-body limit (and are
 * faster/cheaper for the AI providers). Falls back to the original file if the
 * browser can't decode it.
 */
export async function compressImage(
  file: File,
  maxDimension = 1600,
  quality = 0.82
): Promise<File> {
  if (typeof window === "undefined" || !file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob) return file;

    // Only use the compressed version if it actually helped.
    if (blob.size >= file.size && scale === 1) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "room";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file; // unsupported format (e.g. some HEIC) — let the server validate
  }
}
