import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getImageGenerationProvider, isMockPreview } from "@/lib/imageGeneration";
import type { NormalizedPoint } from "@/lib/imageGeneration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const fitCheck = await prisma.fitCheck.findUnique({
      where: { id },
      include: { product: true, measurement: true },
    });

    if (!fitCheck) {
      return NextResponse.json({ error: "Fit check not found." }, { status: 404 });
    }

    const polygonPoints: NormalizedPoint[] | undefined = fitCheck.measurement.polygonPointsJson
      ? (JSON.parse(fitCheck.measurement.polygonPointsJson) as NormalizedPoint[])
      : undefined;

    const provider = getImageGenerationProvider();
    const path = await provider.generatePreview({
      roomImagePath: fitCheck.roomImagePath,
      productName: fitCheck.product.name,
      productImageUrl: fitCheck.product.imageUrl ?? undefined,
      productDimensions: {
        width: fitCheck.product.width,
        height: fitCheck.product.height,
        depth: fitCheck.product.depth,
        unit: fitCheck.product.unit,
      },
      polygonPoints,
    });

    await prisma.fitCheck.update({
      where: { id },
      data: { generatedPreviewPath: path },
    });

    return NextResponse.json({ path, isPlaceholder: isMockPreview() });
  } catch (err) {
    console.error("Preview generation failed:", err);
    const raw = err instanceof Error ? err.message : String(err);
    let friendly = "Preview generation failed. Try again or check your provider settings.";
    if (/\b429\b|quota|rate limit/i.test(raw)) {
      friendly =
        "AI provider quota exceeded (HTTP 429). Enable billing on your provider account, or set IMAGE_GENERATION_PROVIDER=mock to use the placeholder preview.";
    } else if (/\b404\b|not found|not supported/i.test(raw)) {
      friendly =
        "The configured image model was not found (HTTP 404). Check IMAGE_GENERATION_PROVIDER and the *_IMAGE_MODEL setting.";
    } else if (/\b401\b|\b403\b|api key|unauthorized|permission/i.test(raw)) {
      friendly =
        "The AI provider rejected the request (auth). Check your API key for the selected provider.";
    }
    return NextResponse.json({ error: friendly, detail: raw.slice(0, 300) }, { status: 502 });
  }
}
