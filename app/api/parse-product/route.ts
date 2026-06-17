import { NextResponse } from "next/server";
import { z } from "zod";
import { parseProductFromUrl } from "@/lib/productParser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ url: z.string().url("Enter a valid URL") });

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

  try {
    const result = await parseProductFromUrl(parsed.data.url);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Product parse failed:", err);
    // Degrade gracefully so the UI falls back to manual entry.
    return NextResponse.json({
      sourceUrl: parsed.data.url,
      confidence: "low",
      notes: ["Could not parse the product page. Please enter details manually."],
    });
  }
}
