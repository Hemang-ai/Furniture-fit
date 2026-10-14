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
    ? `a polygon with normalized (0–1) vertices ${request.polygonPoints
        .map((p) => `(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`)
        .join(", ")} marked by the shopper`
    : "the most natural location for this product in the room";
  const hasReference = Boolean(request.productImageUrl);

  return `You are generating a photorealistic product-placement preview for an e-commerce "Fit in My Space" feature.

Use the uploaded room photo as the base image. Preserve the original room exactly: same camera angle, perspective, lighting direction, shadows, wall color, floor texture, furniture, reflections, depth of field, and image quality.

Place the selected product into the user-selected placement area only.

${
  hasReference
    ? "Use the real product image provided as the visual reference. Do not invent, redesign, stylize, or alter the product. Preserve the product's real shape, proportions, color, finish, door layout, handles, screen/panel details, logo and brand marks if visible, and material texture — it must be the exact same product and brand as the reference image."
    : `No reference photo is available — render a typical, realistic "${request.productName}" without inventing visible brand logos.`
}

Product: "${request.productName}"
Product dimensions: ${dims}
Placement area: ${area}.

Scale the product realistically using the product dimensions against visible real-world references (counters are typically 36 in tall, base cabinets 24 in deep, interior doors 80 in tall).

The generated image must look like a real photo taken after the product was physically installed in the room. Match: camera perspective, lens distortion, distance from camera, product scale, lighting temperature, shadow softness, contact shadows on floor/wall, reflections on glossy surfaces, color tone and contrast, and the grain/noise/sharpness of the original photo.

Do not make the product look pasted, floating, cartoonish, AI-generated, oversized, undersized, warped, or misaligned. If the product is partially behind counters, walls, or furniture, apply realistic occlusion. If the selected area is not suitable, still generate the closest realistic placement without breaking physical realism.

Do not change the room layout except for placing the product. Do not remove existing objects unless they are inside the placement zone and must be replaced by the product. Do not add people, text, labels, stickers, arrows, banners, or UI elements.

Final output: one realistic edited image showing the selected product accurately placed in the uploaded room photo. This image is an AI visualization, not a measurement guarantee.`;
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

    let prompt = buildPreviewPrompt(request);
    const form = new FormData();
    form.append("model", this.model);
    // gpt-image-1 accepts multiple input images via image[]; the first is the
    // base scene. input_fidelity "high" preserves the input images' details —
    // required so the exact product (brand, logo, finish) and the real room
    // survive the edit instead of being re-imagined. Render quality defaults
    // to "medium": roughly half the latency of "high" while input_fidelity
    // still carries the product/room accuracy. Override with
    // OPENAI_IMAGE_QUALITY=high when fidelity matters more than speed.
    form.append("input_fidelity", "high");
    form.append("quality", process.env.OPENAI_IMAGE_QUALITY?.trim() || "medium");
    form.append("size", "auto");
    // JPEG output downloads/stores faster than PNG with no visible loss here.
    form.append("output_format", "jpeg");
    form.append("output_compression", "90");
    form.append(
      "image[]",
      new Blob([new Uint8Array(room.buffer)], { type: room.mimeType }),
      room.mimeType === "image/jpeg" ? "room.jpg" : "room.png"
    );
    if (request.productImageUrl) {
      const product = await resolveImage(request.productImageUrl);
      if (product) {
        form.append(
          "image[]",
          new Blob([new Uint8Array(product.buffer)], { type: product.mimeType }),
          product.mimeType === "image/jpeg" ? "product.jpg" : "product.png"
        );
        prompt +=
          "\n\nThe first input image is the room photo (base scene). The second input image is the exact product reference — replicate it faithfully.";
      }
    }
    form.append("prompt", prompt);

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
        filename: "preview.jpg",
        contentType: "image/jpeg",
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
            text?: string;
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

    // No image came back. The model usually explains why in a text part (e.g.
    // "this photo doesn't show a room") — surface that instead of a mystery.
    const modelText = responseParts
      .map((p) => p.text ?? "")
      .join(" ")
      .trim();
    if (modelText) {
      throw new Error(`The AI could not generate a preview. It said: "${modelText.slice(0, 280)}"`);
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
