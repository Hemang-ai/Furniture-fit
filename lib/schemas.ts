import { z } from "zod";

/** Product categories offered in the UI. Values map to fitEngine clearance keys. */
export const CATEGORY_OPTIONS = [
  { value: "refrigerator", label: "Refrigerator" },
  { value: "range", label: "Range / Stove / Oven" },
  { value: "dishwasher", label: "Dishwasher" },
  { value: "washer", label: "Washer" },
  { value: "dryer", label: "Dryer" },
  { value: "tv", label: "TV" },
  { value: "furniture", label: "Furniture" },
  { value: "electronics", label: "Electronics" },
  { value: "other", label: "Other" },
] as const;

export const CONFIDENCE_OPTIONS = [
  { value: "HIGH", label: "High — I measured carefully" },
  { value: "MEDIUM", label: "Medium — a careful estimate" },
  { value: "LOW", label: "Low — a rough guess" },
] as const;

const positiveDimension = z
  .number({ invalid_type_error: "Enter a number" })
  .positive("Must be greater than 0");

export const productSchema = z.object({
  sourceUrl: z.string().url().optional().or(z.literal("")).transform((v) => v || undefined),
  name: z.string().min(1, "Product name is required"),
  category: z.string().min(1, "Choose a category"),
  width: positiveDimension,
  height: positiveDimension,
  depth: positiveDimension,
  unit: z.string().default("inches"),
  imageUrl: z
    .string()
    .url("Enter a valid image URL")
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  clearanceNotes: z.string().optional(),
  rawExtractedJson: z.string().optional(),
});

export type ProductInput = z.infer<typeof productSchema>;

export const pointSchema = z.object({ x: z.number(), y: z.number() });

export const measurementSchema = z.object({
  polygonPoints: z.array(pointSchema).optional(),
  availableWidth: z.number().positive().optional(),
  availableHeight: z.number().positive().optional(),
  availableDepth: z.number().positive().optional(),
  unit: z.string().default("inches"),
  calibrationMethod: z.string().default("user_entered"),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  /** "I don't know dimensions" path -> forces NEED_MORE_DATA / low confidence. */
  dontKnow: z.boolean().optional(),
  /**
   * How the dimensions were obtained. "ai_estimated" caps the verdict
   * confidence at LOW (estimated from a photo, not measured).
   */
  dimensionSource: z.enum(["user_entered", "ai_estimated"]).default("user_entered"),
});

export type MeasurementInput = z.infer<typeof measurementSchema>;

export const createFitCheckSchema = z.object({
  roomImagePath: z.string().min(1, "Room image is required"),
  product: productSchema,
  measurement: measurementSchema,
});

export type CreateFitCheckInput = z.infer<typeof createFitCheckSchema>;
