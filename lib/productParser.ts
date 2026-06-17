/**
 * Product URL parser.
 * ---------------------------------------------------------------------------
 * Best-effort, server-side extraction of product details from a public product
 * page. We do NOT bypass anti-bot protection; on any failure we degrade
 * gracefully with confidence "low" so the UI falls back to manual entry.
 *
 * Extracted specs are SUGGESTIONS for the user to confirm — never treated as
 * certain.
 */
import axios from "axios";

export type ParseConfidence = "high" | "medium" | "low";

export interface ParsedProduct {
  sourceUrl: string;
  name?: string;
  category?: string;
  width?: number;
  height?: number;
  depth?: number;
  unit?: string;
  imageUrl?: string;
  confidence: ParseConfidence;
  /** Human-readable notes about what was/wasn't found. */
  notes: string[];
  /** Raw structured data we extracted, for storage/debugging. */
  raw?: Record<string, unknown>;
}

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function parseProductFromUrl(url: string): Promise<ParsedProduct> {
  const result: ParsedProduct = {
    sourceUrl: url,
    confidence: "low",
    notes: [],
  };

  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) {
      result.notes.push("URL must start with http:// or https://.");
      return result;
    }
  } catch {
    result.notes.push("That doesn't look like a valid URL.");
    return result;
  }

  let html = "";
  try {
    const res = await axios.get<string>(url, {
      timeout: 10_000,
      maxRedirects: 5,
      responseType: "text",
      // Treat any non-5xx as resolvable so we can still try to parse partial pages.
      validateStatus: (status) => status < 500,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    html = typeof res.data === "string" ? res.data : String(res.data ?? "");
    if (!html) {
      result.notes.push("The page returned no readable HTML. Please enter details manually.");
      return result;
    }
  } catch {
    result.notes.push(
      "Could not fetch the product page (timeout, blocked, or network error). Please enter details manually."
    );
    return result;
  }

  const raw: Record<string, unknown> = {};

  // 1) JSON-LD schema.org Product ------------------------------------------
  const jsonLd = extractJsonLdProduct(html);
  if (jsonLd) {
    raw.jsonLd = jsonLd;
    if (typeof jsonLd.name === "string") result.name = clean(jsonLd.name);
    const img = pickImage(jsonLd.image);
    if (img) result.imageUrl = img;
    if (typeof jsonLd.category === "string") result.category = clean(jsonLd.category);
    const dims = extractDimensionsFromJsonLd(jsonLd);
    if (dims) Object.assign(result, dims);
  }

  // 2) Open Graph + <title> fallbacks --------------------------------------
  if (!result.name) {
    const ogTitle = matchMeta(html, "og:title") || matchTitle(html);
    if (ogTitle) result.name = clean(ogTitle);
  }
  if (!result.imageUrl) {
    const ogImage = matchMeta(html, "og:image");
    if (ogImage) result.imageUrl = absolutize(ogImage, parsed);
  }

  // 3) Visible dimension patterns ------------------------------------------
  if (result.width === undefined || result.height === undefined || result.depth === undefined) {
    const dims = extractDimensionsFromText(html);
    if (dims) {
      result.width = result.width ?? dims.width;
      result.height = result.height ?? dims.height;
      result.depth = result.depth ?? dims.depth;
      if (dims.unit && !result.unit) result.unit = dims.unit;
    }
  }

  // Confidence scoring -----------------------------------------------------
  const hasAllDims =
    result.width !== undefined && result.height !== undefined && result.depth !== undefined;
  if (jsonLd && result.name && hasAllDims) {
    result.confidence = "high";
    result.notes.push("Structured product data (schema.org) found. Please confirm the values.");
  } else if (result.name && hasAllDims) {
    result.confidence = "medium";
    result.notes.push("Found a title and dimensions. Please confirm they are correct.");
  } else if (result.name) {
    result.confidence = "low";
    result.notes.push(
      "Found a product title but could not reliably read dimensions. Please enter them manually."
    );
  } else {
    result.confidence = "low";
    result.notes.push("Could not extract product details. Please enter them manually.");
  }

  if (!result.unit && hasAllDims) result.unit = "inches";
  result.raw = raw;
  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function matchMeta(html: string, property: string): string | undefined {
  // property="og:title" content="..."  (either attribute order)
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escapeRe(property)}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapeRe(property)}["']`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1]);
  }
  return undefined;
}

function matchTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? decodeEntities(m[1]) : undefined;
}

interface JsonLdProduct {
  name?: string;
  image?: unknown;
  category?: string;
  width?: unknown;
  height?: unknown;
  depth?: unknown;
  additionalProperty?: unknown;
  [key: string]: unknown;
}

function extractJsonLdProduct(html: string): JsonLdProduct | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const text = match[1].trim();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      continue;
    }
    const product = findProductNode(data);
    if (product) return product;
  }
  return null;
}

function findProductNode(data: unknown): JsonLdProduct | null {
  if (!data || typeof data !== "object") return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findProductNode(item);
      if (found) return found;
    }
    return null;
  }
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj["@graph"])) {
    const found = findProductNode(obj["@graph"]);
    if (found) return found;
  }
  const type = obj["@type"];
  const isProduct = Array.isArray(type)
    ? type.some((t) => String(t).toLowerCase() === "product")
    : String(type ?? "").toLowerCase() === "product";
  if (isProduct) return obj as JsonLdProduct;
  return null;
}

function pickImage(image: unknown): string | undefined {
  if (!image) return undefined;
  if (typeof image === "string") return image;
  if (Array.isArray(image) && image.length > 0) return pickImage(image[0]);
  if (typeof image === "object") {
    const url = (image as Record<string, unknown>).url;
    if (typeof url === "string") return url;
  }
  return undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const m = value.match(/[\d.]+/);
    if (m) {
      const n = parseFloat(m[0]);
      if (Number.isFinite(n)) return n;
    }
  }
  if (value && typeof value === "object") {
    const v = (value as Record<string, unknown>).value;
    return toNumber(v);
  }
  return undefined;
}

function extractDimensionsFromJsonLd(
  node: JsonLdProduct
): { width?: number; height?: number; depth?: number; unit?: string } | null {
  const out: { width?: number; height?: number; depth?: number; unit?: string } = {};
  out.width = toNumber(node.width);
  out.height = toNumber(node.height);
  out.depth = toNumber(node.depth);

  // Some feeds put dimensions in additionalProperty: [{ name, value }]
  if (Array.isArray(node.additionalProperty)) {
    for (const prop of node.additionalProperty) {
      if (!prop || typeof prop !== "object") continue;
      const name = String((prop as Record<string, unknown>).name ?? "").toLowerCase();
      const value = (prop as Record<string, unknown>).value;
      if (out.width === undefined && name.includes("width")) out.width = toNumber(value);
      if (out.height === undefined && name.includes("height")) out.height = toNumber(value);
      if (out.depth === undefined && (name.includes("depth") || name.includes("length")))
        out.depth = toNumber(value);
    }
  }

  if (out.width === undefined && out.height === undefined && out.depth === undefined) return null;
  out.unit = "inches";
  return out;
}

/**
 * Look for explicit "Width/Height/Depth" labels first, then a "W x H x D"
 * compact pattern in visible text.
 */
function extractDimensionsFromText(
  html: string
): { width?: number; height?: number; depth?: number; unit?: string } | null {
  const text = decodeEntities(stripTags(html));

  const label = (names: string[]): number | undefined => {
    for (const name of names) {
      const re = new RegExp(`${name}\\s*[:=]?\\s*([\\d]+(?:\\.[\\d]+)?)\\s*(?:in|inch|inches|"|cm|mm)?`, "i");
      const m = text.match(re);
      if (m) {
        const n = parseFloat(m[1]);
        if (Number.isFinite(n)) return n;
      }
    }
    return undefined;
  };

  let width = label(["width"]);
  let height = label(["height"]);
  let depth = label(["depth", "length"]);

  if (width === undefined || height === undefined || depth === undefined) {
    // Compact "35.75 x 70 x 31.5" (optionally with units / labels)
    const compact = text.match(
      /(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)?\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)?\s*[xX×]\s*(\d+(?:\.\d+)?)/
    );
    if (compact) {
      width = width ?? parseFloat(compact[1]);
      height = height ?? parseFloat(compact[2]);
      depth = depth ?? parseFloat(compact[3]);
    }
  }

  if (width === undefined && height === undefined && depth === undefined) return null;
  const unit = /\bcm\b/i.test(text) && !/\b(in|inch|inches|")\b/i.test(text) ? "cm" : "inches";
  return { width, height, depth, unit };
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

function absolutize(url: string, base: URL): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}
