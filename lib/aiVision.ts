/**
 * AI vision-based dimension estimation.
 * ---------------------------------------------------------------------------
 * Estimates a product's real-world dimensions and/or the available space in a
 * room photo when the user doesn't know them. These are ESTIMATES — the result
 * is always LOW or MEDIUM confidence and clearly labeled. Manual measurements
 * should always override them.
 *
 * Providers (configurable via VISION_PROVIDER):
 *   - "mock"   : heuristic estimate from typical category sizes (no API key)
 *   - "openai" : GPT vision (chat completions with an image)
 *   - "gemini" : Gemini vision (generateContent with inline image data)
 */
import { normalizeCategory } from "@/lib/fitEngine";
import { resolveImage } from "@/lib/imageFile";

export type EstimateTarget = "product" | "available" | "both";

export interface DimensionTriple {
  width: number;
  height: number;
  depth: number;
}

export interface VisionEstimate {
  product?: DimensionTriple;
  available?: DimensionTriple;
  unit: string;
  confidence: "LOW" | "MEDIUM";
  reasoning: string;
  assumptions: string[];
  provider: string;
  /** True when the estimate is a non-vision heuristic (mock fallback). */
  isHeuristic: boolean;
}

export interface VisionEstimationRequest {
  roomImagePath?: string;
  productName?: string;
  category: string;
  target: EstimateTarget;
  polygonPoints?: { x: number; y: number }[];
  /** Known product dimensions (helps when estimating only the available space). */
  productDimensions?: DimensionTriple;
}

export interface VisionEstimationProvider {
  estimateDimensions(request: VisionEstimationRequest): Promise<VisionEstimate>;
}

/** Typical product sizes (inches) used by the heuristic fallback. */
const TYPICAL: Record<string, DimensionTriple> = {
  refrigerator: { width: 35.75, height: 70, depth: 31.5 },
  range: { width: 30, height: 36, depth: 28 },
  dishwasher: { width: 23.875, height: 34, depth: 24 },
  washer: { width: 27, height: 38.7, depth: 31.3 },
  dryer: { width: 27, height: 38.7, depth: 31.3 },
  tv: { width: 57, height: 33, depth: 2.4 },
  furniture: { width: 60, height: 36, depth: 36 },
  electronics: { width: 17, height: 6, depth: 14 },
  default: { width: 24, height: 36, depth: 24 },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function typicalFor(category: string): DimensionTriple {
  return TYPICAL[normalizeCategory(category)] ?? TYPICAL.default;
}

/**
 * Heuristic provider — works with no API key. Estimates product size from
 * typical category dimensions, and (when asked) suggests an available space
 * that would MOST LIKELY accommodate the product (product + a little clearance).
 */
export class MockVisionEstimationProvider implements VisionEstimationProvider {
  async estimateDimensions(request: VisionEstimationRequest): Promise<VisionEstimate> {
    const product = request.productDimensions ?? typicalFor(request.category);
    const out: VisionEstimate = {
      unit: "inches",
      confidence: "LOW",
      provider: "mock",
      isHeuristic: true,
      assumptions: [
        "Based on typical sizes for this category, NOT on analysis of your photo.",
        "Set VISION_PROVIDER=openai or gemini (with an API key) for photo-aware estimates.",
      ],
      reasoning: "",
    };

    if (request.target === "product" || request.target === "both") {
      out.product = { ...typicalFor(request.category) };
    }
    if (request.target === "available" || request.target === "both") {
      // Suggest the opening most likely to fit: product + modest clearance.
      out.available = {
        width: round2(product.width + 2),
        height: round2(product.height + 3),
        depth: round2(product.depth + 3),
      };
    }

    out.reasoning =
      `Heuristic estimate for a ${request.category || "product"}. ` +
      (out.product ? `Assumed a typical size of ${fmt(out.product)}. ` : "") +
      (out.available
        ? `Suggested an opening of ${fmt(out.available)} as the size most likely to accommodate it. `
        : "") +
      "Confirm with real measurements — this is a rough estimate, not an image-based measurement.";
    return out;
  }
}

function fmt(d: DimensionTriple): string {
  return `${d.width} × ${d.height} × ${d.depth} in (W×H×D)`;
}

// ---------------------------------------------------------------------------
// Shared prompt
// ---------------------------------------------------------------------------

function buildPrompt(request: VisionEstimationRequest): string {
  const wantProduct = request.target === "product" || request.target === "both";
  const wantAvailable = request.target === "available" || request.target === "both";
  const area = request.polygonPoints?.length
    ? request.polygonPoints.map((p) => `(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`).join(", ")
    : "the most likely placement area";

  return [
    "You are estimating physical dimensions to help a shopper decide if a product will fit a space.",
    `Product: "${request.productName || "(unspecified)"}", category: "${request.category}".`,
    wantProduct
      ? "Estimate the PRODUCT's real-world dimensions in inches based on its name/category and typical sizes."
      : "",
    wantAvailable
      ? `Estimate the AVAILABLE SPACE (opening) dimensions in inches inside the marked area of the room photo. ` +
        `Marked area (normalized 0-1 polygon): ${area}. ` +
        `Use visual scale cues (counter height ~36in, door height ~80in, standard cabinet/tile sizes, outlets ~4.5in) to calibrate.`
      : "",
    request.productDimensions
      ? `Known product dimensions for reference: ${fmt(request.productDimensions)}.`
      : "",
    "These are ESTIMATES, not measurements. Be conservative.",
    "Respond with STRICT JSON only, no markdown, matching this shape:",
    `{"product":{"width":number,"height":number,"depth":number}|null,` +
      `"available":{"width":number,"height":number,"depth":number}|null,` +
      `"unit":"inches","confidence":"LOW"|"MEDIUM","reasoning":string,"assumptions":string[]}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function coerceTriple(v: unknown): DimensionTriple | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const w = Number(o.width);
  const h = Number(o.height);
  const d = Number(o.depth);
  if (![w, h, d].every((n) => Number.isFinite(n) && n > 0)) return undefined;
  return { width: round2(w), height: round2(h), depth: round2(d) };
}

function parseEstimateJson(text: string, provider: string): VisionEstimate {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const data = JSON.parse(cleaned) as Record<string, unknown>;
  const confidence = data.confidence === "MEDIUM" ? "MEDIUM" : "LOW";
  return {
    product: coerceTriple(data.product),
    available: coerceTriple(data.available),
    unit: typeof data.unit === "string" ? data.unit : "inches",
    confidence,
    reasoning: typeof data.reasoning === "string" ? data.reasoning : "AI-estimated from the photo.",
    assumptions: Array.isArray(data.assumptions)
      ? data.assumptions.filter((a): a is string => typeof a === "string")
      : [],
    provider,
    isHeuristic: false,
  };
}

// ---------------------------------------------------------------------------
// OpenAI vision provider
// ---------------------------------------------------------------------------

export class OpenAIVisionEstimationProvider implements VisionEstimationProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.model = model ?? process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini";
  }

  async estimateDimensions(request: VisionEstimationRequest): Promise<VisionEstimate> {
    if (!this.apiKey) throw new Error("OPENAI_API_KEY is not set.");
    const image = request.roomImagePath ? await resolveImage(request.roomImagePath) : null;

    const content: Array<Record<string, unknown>> = [{ type: "text", text: buildPrompt(request) }];
    if (image) {
      content.push({ type: "image_url", image_url: { url: image.dataUrl } });
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content }],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI vision failed (${res.status}): ${detail.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content;
    if (!text) throw new Error("OpenAI vision returned no content.");
    return parseEstimateJson(text, "openai");
  }
}

// ---------------------------------------------------------------------------
// Gemini vision provider
// ---------------------------------------------------------------------------

export class GeminiVisionEstimationProvider implements VisionEstimationProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey ?? process.env.GEMINI_API_KEY ?? "";
    this.model = model ?? process.env.GEMINI_VISION_MODEL ?? "gemini-2.0-flash";
  }

  async estimateDimensions(request: VisionEstimationRequest): Promise<VisionEstimate> {
    if (!this.apiKey) throw new Error("GEMINI_API_KEY is not set.");
    const image = request.roomImagePath ? await resolveImage(request.roomImagePath) : null;

    const parts: Array<Record<string, unknown>> = [{ text: buildPrompt(request) }];
    if (image) {
      parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Gemini vision failed (${res.status}): ${detail.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
    if (!text) throw new Error("Gemini vision returned no content.");
    return parseEstimateJson(text, "gemini");
  }
}

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

export function getVisionProviderName(): "mock" | "openai" | "gemini" {
  const provider = (process.env.VISION_PROVIDER ?? "mock").toLowerCase();
  if (provider === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (provider === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  return "mock";
}

export function getVisionEstimationProvider(): VisionEstimationProvider {
  switch (getVisionProviderName()) {
    case "openai":
      return new OpenAIVisionEstimationProvider();
    case "gemini":
      return new GeminiVisionEstimationProvider();
    default:
      return new MockVisionEstimationProvider();
  }
}
