import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { FitReport } from "@/lib/fitEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const fitCheck = await prisma.fitCheck.findUnique({
      where: { id },
      include: { product: true, measurement: true },
    });

    if (!fitCheck) {
      return NextResponse.json({ error: "Fit check not found." }, { status: 404 });
    }

    const fitReport: FitReport | null = fitCheck.fitReportJson
      ? (JSON.parse(fitCheck.fitReportJson) as FitReport)
      : null;
    const polygonPoints = fitCheck.measurement.polygonPointsJson
      ? JSON.parse(fitCheck.measurement.polygonPointsJson)
      : null;

    return NextResponse.json({
      ...fitCheck,
      fitReport,
      measurement: { ...fitCheck.measurement, polygonPoints },
    });
  } catch (err) {
    console.error("Failed to load fit check:", err);
    return NextResponse.json({ error: "Failed to load fit check." }, { status: 500 });
  }
}
