import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateFit } from "@/lib/fitEngine";
import { createFitCheckSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createFitCheckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed.", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { roomImagePath, product, measurement } = parsed.data;
  const unit = product.unit || measurement.unit || "inches";
  const dontKnow = !!measurement.dontKnow;
  const aiEstimated = measurement.dimensionSource === "ai_estimated";

  const availableDimensions =
    dontKnow ||
    measurement.availableWidth === undefined ||
    measurement.availableHeight === undefined ||
    measurement.availableDepth === undefined
      ? null
      : {
          width: measurement.availableWidth,
          height: measurement.availableHeight,
          depth: measurement.availableDepth,
          unit,
        };

  const report = calculateFit({
    category: product.category,
    productDimensions: {
      width: product.width,
      height: product.height,
      depth: product.depth,
      unit,
    },
    availableDimensions,
    forceNeedMoreData: dontKnow,
    confidenceCeiling: aiEstimated ? "LOW" : undefined,
    unit,
  });

  try {
    const rawExtracted =
      product.rawExtractedJson ??
      (product.clearanceNotes
        ? JSON.stringify({ clearanceNotes: product.clearanceNotes })
        : null);

    const createdProduct = await prisma.product.create({
      data: {
        sourceUrl: product.sourceUrl ?? null,
        name: product.name,
        category: product.category,
        width: product.width,
        height: product.height,
        depth: product.depth,
        unit,
        imageUrl: product.imageUrl ?? null,
        rawExtractedJson: rawExtracted,
      },
    });

    const createdMeasurement = await prisma.measurement.create({
      data: {
        roomImagePath,
        polygonPointsJson: measurement.polygonPoints
          ? JSON.stringify(measurement.polygonPoints)
          : null,
        availableWidth: availableDimensions?.width ?? null,
        availableHeight: availableDimensions?.height ?? null,
        availableDepth: availableDimensions?.depth ?? null,
        unit,
        calibrationMethod: aiEstimated
          ? "ai_estimated"
          : measurement.calibrationMethod || "user_entered",
        confidence: dontKnow || aiEstimated ? "LOW" : measurement.confidence,
      },
    });

    const fitCheck = await prisma.fitCheck.create({
      data: {
        status: "complete",
        roomImagePath,
        productId: createdProduct.id,
        measurementId: createdMeasurement.id,
        fitReportJson: JSON.stringify(report),
      },
    });

    return NextResponse.json({ id: fitCheck.id, fitReport: report });
  } catch (err) {
    console.error("Failed to create fit check:", err);
    return NextResponse.json({ error: "Failed to save fit check." }, { status: 500 });
  }
}
