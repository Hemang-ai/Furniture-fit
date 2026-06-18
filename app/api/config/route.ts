import { NextResponse } from "next/server";
import { getImageProviderName } from "@/lib/imageGeneration";
import { getVisionProviderName } from "@/lib/aiVision";
import { getStorageProviderName } from "@/lib/fileStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reports the ACTIVE AI providers (after accounting for missing keys) so the UI
 * can show what's enabled. Never returns secrets.
 */
export async function GET() {
  const imageRequested = (process.env.IMAGE_GENERATION_PROVIDER ?? "mock").toLowerCase();
  const visionRequested = (process.env.VISION_PROVIDER ?? "mock").toLowerCase();

  return NextResponse.json({
    image: {
      requested: imageRequested,
      active: getImageProviderName(),
    },
    vision: {
      requested: visionRequested,
      active: getVisionProviderName(),
    },
    storage: {
      active: getStorageProviderName(),
    },
    keys: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
      blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      supabase: Boolean(
        (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) &&
          process.env.SUPABASE_SERVICE_ROLE_KEY
      ),
    },
  });
}
