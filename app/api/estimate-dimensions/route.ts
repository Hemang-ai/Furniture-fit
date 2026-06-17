import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getVisionEstimationProvider,
  MockVisionEstimationProvider,
  type VisionEstimationRequest,
} from "@/lib/aiVision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tripleSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  depth: z.number().positive(),
});

const bodySchema = z.object({
  roomImagePath: z.string().optional(),
  productName: z.string().optional(),
  category: z.string().default("other"),
  target: z.enum(["product", "available", "both"]).default("both"),
  polygonPoints: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  productDimensions: tripleSchema.optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const req: VisionEstimationRequest = parsed.data;

  try {
    const provider = getVisionEstimationProvider();
    const estimate = await provider.estimateDimensions(req);
    return NextResponse.json(estimate);
  } catch (err) {
    console.error("AI estimation failed, falling back to heuristic:", err);
    // Degrade gracefully so the user still gets a suggestion.
    const fallback = await new MockVisionEstimationProvider().estimateDimensions(req);
    fallback.assumptions = [
      "The configured AI provider was unavailable; used a heuristic estimate instead.",
      ...fallback.assumptions,
    ];
    return NextResponse.json(fallback);
  }
}
