/**
 * AI preview image generation.
 * ---------------------------------------------------------------------------
 * Provider abstraction, configurable via IMAGE_GENERATION_PROVIDER:
 *   - "mock"   : returns the original room image (UI labels it a placeholder)
 *   - "openai" : OpenAI Images edit API (gpt-image-1) — edits the room photo
 *   - "gemini" : Gemini image model — edits the room photo with the product
 *
 * Generated previews are AI VISUALIZATIONS, not measurement guarantees.
 */
import { getFileStorage } from "@/lib/fileStorage";
import { resolveImage } from "@/lib/imageFile";

export interface NormalizedPoint {
  x: number; // 0..1
  y: number; // 0..1
}

export interface ImageGenerationRequest {
  /** Public path or URL of the room photo. */
  roomImagePath: string;
  productName: string;
  productImageUrl?: string;
  productDimensions?: {
    width: number;
    height: number;
    depth: number;
    unit: string;
  };
  /** Normalized polygon marking where the product should go. */
  polygonPoints?: NormalizedPoint[];
}

export interface ImageGenerationProvider {
  /** Returns a public path/URL to the generated preview image. */
  generatePreview(request: ImageGenerationRequest): Promise<string>;
}

export type ImageProviderName = "mock" | "openai" | "gemini";

/** Build the shared instruction prompt used by real providers. */
export function buildPreviewPrompt(request: ImageGenerationRequest): string {
  const dims = request.productDimensions
    ? `${request.productDimensions.width} x ${request.productDimensions.height} x ${request.productDimensions.depth} ${request.productDimensions.unit} (W x H x D)`
    : "unspecified dimensions";
  const area = request.polygonPoints?.length
    ? request.polygonPoints.map((p) => `(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`).join(", ")
    : "the marked area";

  return [
    `Place the product "${request.productName}" (${dims}) realistically into the marked area of the room photo.`,
    `Marked area (normalized polygon coordinates): ${area}.`,
    "Preserve the original room layout, cabinets, walls, lighting, perspective, and flooring.",
    "Do not change room architecture. Match scale based on the provided dimensions.",
    "This image is an AI visualization, not a measurement guarantee.",
  ].join(" ");
}

/** Default provider: echoes the room image; UI labels it as a placeholder. */
export class MockImageGenerationProvider implements ImageGenerationProvider {
  async generatePreview(request: ImageGenerationRequest): Promise<string> {
    return request.roomImagePath;
  }
}

/**
 * OpenAI image provider. Uses the Images *edit* endpoint with gpt-image-1 so
 * the generation is conditioned on the actual room photo. Requires OPENAI_API_KEY.
 */
export class OpenAIImageGenerationProvider implements ImageGenerationProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.model = model ?? process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
  }

  async generatePreview(request: ImageGenerationRequest): Promise<string> {
    if (!this.apiKey) throw new Error("OPENAI_API_KEY is not set; cannot generate a preview.");

    const room = await resolveImage(request.roomImagePath);
    if (!room) throw new Error("Could not read the room image for editing.");

    const prompt = buildPreviewPrompt(request);
    const form = new FormData();
    form.append("model", this.model);
    form.append("prompt", prompt);
    form.append("size", "1024x1024");
    form.append(
      "image",
      new Blob([new Uint8Array(room.buffer)], { type: room.mimeType }),
      "room.png"
    );
    // Optionally provide the product image as additional context.
    if (request.productImageUrl) {
      const product = await resolveImage(request.productImageUrl);
      if (product) {
        form.append(
          "image[]",
          new Blob([new Uint8Array(product.buffer)], { type: product.mimeType }),
          "product.png"
        );
      }
    }

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI image edit failed (${res.status}): ${detail.slice(0, 200)}`);
    }

    const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const item = json.data?.[0];
    if (item?.b64_json) {
      return getFileStorage().save({
        buffer: Buffer.from(item.b64_json, "base64"),
        filename: "preview.png",
        contentType: "image/png",
      });
    }
    if (item?.url) return getFileStorage().saveFromUrl(item.url);
    throw new Error("OpenAI image edit returned no image.");
  }
}

/**
 * Gemini image provider. Uses an image-capable Gemini model via generateContent,
 * passing the room photo (and product image when available) plus the prompt.
 * Requires GEMINI_API_KEY.
 */
export class GeminiImageGenerationProvider implements ImageGenerationProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey ?? process.env.GEMINI_API_KEY ?? "";
    this.model = model ?? process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";
  }

  async generatePreview(request: ImageGenerationRequest): Promise<string> {
    if (!this.apiKey) throw new Error("GEMINI_API_KEY is not set; cannot generate a preview.");

    const room = await resolveImage(request.roomImagePath);
    if (!room) throw new Error("Could not read the room image for editing.");

    const parts: Array<Record<string, unknown>> = [
      { text: buildPreviewPrompt(request) },
      { inlineData: { mimeType: room.mimeType, data: room.base64 } },
    ];
    if (request.productImageUrl) {
      const product = await resolveImage(request.productImageUrl);
      if (product) {
        parts.push({ text: "Reference image of the product to place:" });
        parts.push({ inlineData: { mimeType: product.mimeType, data: product.base64 } });
      }
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Gemini image generation failed (${res.status}): ${detail.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: { mimeType?: string; data?: string };
            inline_data?: { mime_type?: string; data?: string };
          }>;
        };
      }>;
    };

    const responseParts = json.candidates?.[0]?.content?.parts ?? [];
    for (const part of responseParts) {
      const inline = part.inlineData ?? part.inline_data;
      const data = inline?.data;
      const mimeType =
        (part.inlineData?.mimeType ?? part.inline_data?.mime_type) || "image/png";
      if (data) {
        return getFileStorage().save({
          buffer: Buffer.from(data, "base64"),
          filename: "preview.png",
          contentType: mimeType,
        });
      }
    }
    throw new Error("Gemini returned no image data.");
  }
}

/** Resolve the active provider name, accounting for missing API keys. */
export function getImageProviderName(): ImageProviderName {
  const provider = (process.env.IMAGE_GENERATION_PROVIDER ?? "mock").toLowerCase();
  if (provider === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (provider === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  return "mock";
}

/**
 * Resolve the provider. Falls back to mock when a real provider is requested
 * without the matching API key.
 */
export function getImageGenerationProvider(): ImageGenerationProvider {
  switch (getImageProviderName()) {
    case "openai":
      return new OpenAIImageGenerationProvider();
    case "gemini":
      return new GeminiImageGenerationProvider();
    default:
      return new MockImageGenerationProvider();
  }
}

/** Whether the active provider only returns a placeholder (the room image). */
export function isMockPreview(): boolean {
  return getImageProviderName() === "mock";
}
