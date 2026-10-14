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

  // 3) Embedded spec data (term/description JSON pairs + spec tables) -------
  // Retailer PDPs (LG.com among them) ship their spec sheet as JSON inside the
  // page even when the visible table is JS-rendered. Read it directly.
  if (result.width === undefined || result.height === undefined || result.depth === undefined) {
    const pairs = extractSpecPairs(html);
    if (Object.keys(pairs).length > 0) raw.specPairs = pairs;
    const dims = dimensionsFromSpecPairs(pairs);
    if (dims) {
      result.width = result.width ?? dims.width;
      result.height = result.height ?? dims.height;
      result.depth = result.depth ?? dims.depth;
      if (dims.unit && !result.unit) result.unit = dims.unit;
      result.notes.push("Dimensions read from the product page's specification data.");
    }
  }

  // 4) Visible dimension patterns ------------------------------------------
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

  // Category inference ------------------------------------------------------
  // Normalize whatever we saw (JSON-LD category text, product name, URL path)
  // into one of the app's category slugs so the form select auto-fills.
  const inferred = inferCategorySlug([result.category, result.name, parsed.pathname]);
  if (inferred) {
    result.category = inferred;
    result.notes.push(`Category detected as "${inferred}" — change it if that's wrong.`);
  } else {
    result.category = undefined; // never pass free text the select can't hold
    result.notes.push("Could not detect a category — please choose one.");
  }

  result.raw = raw;
  return result;
}

/**
 * Extract spec label/value pairs embedded in the page:
 *  - JSON "description"/"term" pairs (either key order, escaped quotes handled)
 *    as used by LG.com and similar JS-rendered PDPs
 *  - generic <th|td>Label</..><td>Value</td> spec-table rows
 */
export function extractSpecPairs(html: string): Record<string, string> {
  const specs: Record<string, string> = {};
  const pairRe = /"description":"((?:[^"\\]|\\.)*)"\s*,\s*"term":"((?:[^"\\]|\\.)*)"/g;
  let p: RegExpExecArray | null;
  while ((p = pairRe.exec(html)) !== null) {
    const value = unescapeJson(p[1]).trim();
    const label = unescapeJson(p[2]).trim();
    if (label && value && !specs[label]) specs[label] = value;
  }
  const pairRe2 = /"term":"((?:[^"\\]|\\.)*)"\s*,\s*"description":"((?:[^"\\]|\\.)*)"/g;
  while ((p = pairRe2.exec(html)) !== null) {
    const label = unescapeJson(p[1]).trim();
    const value = unescapeJson(p[2]).trim();
    if (label && value && !specs[label]) specs[label] = value;
  }
  const rowRe =
    /<t[hd][^>]*>\s*([^<]{2,60}?)\s*<\/t[hd]>\s*<td[^>]*>\s*([^<]{1,60}?)\s*<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    const label = decodeEntities(m[1]).trim();
    const value = decodeEntities(m[2]).trim();
    if (label && value && !specs[label]) specs[label] = value;
  }
  return specs;
}

function unescapeJson(s: string): string {
  try {
    return JSON.parse(`"${s}"`) as string;
  } catch {
    return s
      .replace(/\\"/g, '"')
      .replace(/\\u0026/g, "&")
      .replace(/\\\//g, "/")
      .replace(/\\\\/g, "\\");
  }
}

/** Parse a spec value like `35.75"`, `35 3/4 in`, or `90.8 cm` into a number + unit. */
function parseDimensionValue(value: string): { n: number; unit: string } | undefined {
  const m = value.match(/(\d+(?:\.\d+)?)(?:\s+(\d+)\s*\/\s*(\d+))?/);
  if (!m) return undefined;
  let n = parseFloat(m[1]);
  if (m[2] && m[3] && Number(m[3]) !== 0) n += Number(m[2]) / Number(m[3]);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const unit = /\bcm\b/i.test(value) ? "cm" : /\bmm\b/i.test(value) ? "mm" : "inches";
  return { n: Math.round(n * 100) / 100, unit };
}

/** Labels that describe packaging, not the product — never use these. */
const EXCLUDED_LABEL = /carton|box|ship|package|packag|pallet|interior|shelf|screen/i;

function pickSpec(
  pairs: Record<string, string>,
  priorities: RegExp[]
): { n: number; unit: string } | undefined {
  for (const re of priorities) {
    for (const [label, value] of Object.entries(pairs)) {
      if (EXCLUDED_LABEL.test(label)) continue;
      if (re.test(label)) {
        const parsed = parseDimensionValue(value);
        if (parsed) return parsed;
      }
    }
  }
  return undefined;
}

/**
 * Map extracted spec pairs to W/H/D. Specific product labels win; packaging
 * ("Carton Dimensions") and interior measurements are excluded.
 */
export function dimensionsFromSpecPairs(
  pairs: Record<string, string>
): { width?: number; height?: number; depth?: number; unit?: string } | undefined {
  if (Object.keys(pairs).length === 0) return undefined;
  // Fit checks need the INSTALLED envelope: the tallest point (hinge) and the
  // deepest point (handles), never door-open or hinge-cover partials.
  const width = pickSpec(pairs, [/^width$/i, /^(product\s*)?width\b(?!.*door)/i]);
  const height = pickSpec(pairs, [
    /^height$/i,
    /^height\s*to\s*top\s*of\s*(door\s*)?hinge/i,
    /^height\s*\(?floor\s*to\s*top/i,
    /^height\s*to\s*top\s*of\s*(case|cabinet)/i,
    /^(product\s*)?height\b/i,
  ]);
  const depth = pickSpec(pairs, [
    /^depth$/i,
    /^depth\s*\(?with\s*handles?/i,
    /^depth\s*\(?without\s*handles?/i,
    /^(product\s*)?depth\b(?!.*(hinge|door))/i,
  ]);
  if (!width && !height && !depth) return undefined;
  const unit = width?.unit ?? height?.unit ?? depth?.unit;
  return { width: width?.n, height: height?.n, depth: depth?.n, unit };
}

/**
 * Map free text (page category, product title, URL path) onto one of the
 * category slugs used by the form select and the fit engine's clearance rules.
 * Order matters: more specific appliance words are checked before broad ones.
 */
export function inferCategorySlug(sources: Array<string | undefined>): string | undefined {
  const text = sources.filter(Boolean).join(" ").toLowerCase();
  if (!text) return undefined;
  if (/(refrigerat|fridge|freezer)/.test(text)) return "refrigerator";
  if (/dishwash/.test(text)) return "dishwasher";
  if (/(range|stove|oven|cooktop)/.test(text)) return "range";
  // "washer-dryer" combos land on washer; check dryer first only when alone.
  if (/wash(er|ing)/.test(text)) return "washer";
  if (/dryer/.test(text)) return "dryer";
  if (/(television|\btvs?\b|oled|qled)/.test(text)) return "tv";
  if (/(sofa|couch|sectional|cabinet|dresser|wardrobe|bookcase|table|desk|furniture|mattress|bed\b)/.test(text))
    return "furniture";
  if (/(monitor|soundbar|speaker|console|electronics)/.test(text)) return "electronics";
  return undefined;
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
