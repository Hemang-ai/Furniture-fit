"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Upload,
  Link2,
  Pencil,
  Loader2,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ImageIcon,
  Wand2,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Disclaimer } from "@/components/Disclaimer";
import {
  ImageAnnotationCanvas,
  type NormalizedPoint,
} from "@/components/ImageAnnotationCanvas";
import { CATEGORY_OPTIONS, CONFIDENCE_OPTIONS } from "@/lib/schemas";
import { compressImage } from "@/lib/imageCompress";
import { cn } from "@/lib/utils";

const reqNum = (msg = "Required") =>
  z.preprocess(
    (v) => (typeof v === "number" && Number.isNaN(v) ? undefined : v),
    z
      .number({ required_error: msg, invalid_type_error: msg })
      .positive("Must be greater than 0")
  );

const optNum = z.preprocess(
  (v) => (typeof v === "number" && Number.isNaN(v) ? undefined : v),
  z.number().positive("Must be greater than 0").optional()
);

const urlOpt = z.string().trim().url("Enter a valid URL").optional().or(z.literal(""));

const wizardSchema = z
  .object({
    name: z.string().min(1, "Product name is required"),
    category: z.string().min(1, "Choose a category"),
    sourceUrl: urlOpt,
    imageUrl: urlOpt,
    width: reqNum(),
    height: reqNum(),
    depth: reqNum(),
    unit: z.string().default("inches"),
    clearanceNotes: z.string().optional(),
    availableWidth: optNum,
    availableHeight: optNum,
    availableDepth: optNum,
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
    dontKnow: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    if (!val.dontKnow) {
      for (const f of ["availableWidth", "availableHeight", "availableDepth"] as const) {
        if (val[f] === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Required (or check “I don’t know”)",
            path: [f],
          });
        }
      }
    }
  });

interface FormValues {
  name: string;
  category: string;
  sourceUrl?: string;
  imageUrl?: string;
  width: number;
  height: number;
  depth: number;
  unit: string;
  clearanceNotes?: string;
  availableWidth?: number;
  availableHeight?: number;
  availableDepth?: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  dontKnow: boolean;
}

interface EstimateInfo {
  provider: string;
  confidence: string;
  reasoning: string;
  assumptions: string[];
  isHeuristic: boolean;
}

const STEP_TITLES = ["Room photo", "Product", "Placement & measurements"];

export default function NewFitCheckPage() {
  const router = useRouter();
  const [step, setStep] = React.useState(1);
  const [roomFile, setRoomFile] = React.useState<File | null>(null);
  const [roomPreview, setRoomPreview] = React.useState<string | null>(null);
  const [roomImagePath, setRoomImagePath] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [points, setPoints] = React.useState<NormalizedPoint[]>([]);
  const [productMode, setProductMode] = React.useState<"url" | "manual">("manual");
  const [urlToParse, setUrlToParse] = React.useState("");
  const [parsing, setParsing] = React.useState(false);
  const [parseNotes, setParseNotes] = React.useState<string[] | null>(null);
  const [parseConfidence, setParseConfidence] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // AI estimation state
  const [estimatingProduct, setEstimatingProduct] = React.useState(false);
  const [estimatingAvailable, setEstimatingAvailable] = React.useState(false);
  const [productEstimated, setProductEstimated] = React.useState(false);
  const [availableEstimated, setAvailableEstimated] = React.useState(false);
  const [estimateInfo, setEstimateInfo] = React.useState<EstimateInfo | null>(null);
  const [estimateError, setEstimateError] = React.useState<string | null>(null);
  const [providers, setProviders] = React.useState<{ vision: string; image: string } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(wizardSchema) as unknown as Resolver<FormValues>,
    mode: "onTouched",
    defaultValues: {
      name: "",
      category: "",
      sourceUrl: "",
      imageUrl: "",
      unit: "inches",
      clearanceNotes: "",
      confidence: "MEDIUM",
      dontKnow: false,
    },
  });

  const {
    register,
    handleSubmit,
    trigger,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = form;

  const dontKnow = watch("dontKnow");

  // Which AI providers are active (after key checks).
  React.useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => {
        setProviders({ vision: c.vision?.active ?? "mock", image: c.image?.active ?? "mock" });
      })
      .catch(() => setProviders({ vision: "mock", image: "mock" }));
  }, []);

  // Manage object URL lifecycle for the room preview.
  React.useEffect(() => {
    if (!roomFile) {
      setRoomPreview(null);
      return;
    }
    const url = URL.createObjectURL(roomFile);
    setRoomPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [roomFile]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setRoomFile(file);
      setRoomImagePath(null); // force re-upload of the new file
      setPoints([]);
    }
  }

  /**
   * Upload the room file once and cache the resulting path/URL.
   * - Vercel Blob: upload straight from the browser to Blob (bypasses the 4.5 MB
   *   serverless request-body limit).
   * - Local: POST to /api/upload (writes to /public/uploads).
   */
  async function ensureRoomUploaded(): Promise<string | null> {
    if (roomImagePath) return roomImagePath;
    if (!roomFile) return null;
    setUploading(true);
    try {
      // Downscale/compress in the browser so even big phone photos fit the
      // serverless request-body limit. The server route persists to whatever
      // backend is configured (Supabase / Vercel Blob / local disk).
      const compressed = await compressImage(roomFile);
      const fd = new FormData();
      fd.append("file", compressed);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        // Error bodies may be non-JSON (e.g. a 413 "Request Entity Too Large").
        let message = `Upload failed (HTTP ${res.status}).`;
        try {
          message = (await res.json()).error ?? message;
        } catch {
          if (res.status === 413) message = "Image is too large to upload. Try a smaller photo.";
        }
        throw new Error(message);
      }
      const json = await res.json();
      setRoomImagePath(json.path as string);
      return json.path as string;
    } finally {
      setUploading(false);
    }
  }

  async function handleParseUrl() {
    if (!urlToParse.trim()) return;
    setParsing(true);
    setParseNotes(null);
    setParseConfidence(null);
    try {
      const res = await fetch("/api/parse-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlToParse.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setParseNotes([data.error ?? "Could not parse that URL."]);
        return;
      }
      setValue("sourceUrl", data.sourceUrl ?? urlToParse.trim());
      if (data.name) setValue("name", data.name, { shouldValidate: true });
      if (data.imageUrl) setValue("imageUrl", data.imageUrl);
      if (typeof data.width === "number") setValue("width", data.width, { shouldValidate: true });
      if (typeof data.height === "number")
        setValue("height", data.height, { shouldValidate: true });
      if (typeof data.depth === "number") setValue("depth", data.depth, { shouldValidate: true });
      setParseNotes(data.notes ?? []);
      setParseConfidence(data.confidence ?? null);
    } catch {
      setParseNotes(["Network error while fetching the product page. Please enter details manually."]);
    } finally {
      setParsing(false);
    }
  }

  function applyEstimateInfo(data: EstimateInfo) {
    setEstimateInfo({
      provider: data.provider,
      confidence: data.confidence,
      reasoning: data.reasoning,
      assumptions: data.assumptions ?? [],
      isHeuristic: data.isHeuristic,
    });
  }

  /** Estimate the PRODUCT dimensions with AI (category + photo aware). */
  async function estimateProduct() {
    setEstimatingProduct(true);
    setEstimateError(null);
    try {
      const path = await ensureRoomUploaded().catch(() => null);
      const res = await fetch("/api/estimate-dimensions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomImagePath: path ?? undefined,
          productName: getValues("name") || undefined,
          category: getValues("category") || "other",
          target: "product",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Estimation failed.");
      if (data.product) {
        setValue("width", data.product.width, { shouldValidate: true });
        setValue("height", data.product.height, { shouldValidate: true });
        setValue("depth", data.product.depth, { shouldValidate: true });
        setProductEstimated(true);
      }
      applyEstimateInfo(data);
    } catch (err) {
      setEstimateError(err instanceof Error ? err.message : "Estimation failed.");
    } finally {
      setEstimatingProduct(false);
    }
  }

  /** Estimate the AVAILABLE SPACE with AI from the photo + marked area. */
  async function estimateAvailable() {
    setEstimatingAvailable(true);
    setEstimateError(null);
    try {
      const path = await ensureRoomUploaded();
      if (!path) {
        throw new Error("Add a room photo in Step 1 first.");
      }
      const w = getValues("width");
      const h = getValues("height");
      const d = getValues("depth");
      const productDimensions =
        [w, h, d].every((n) => typeof n === "number" && !Number.isNaN(n))
          ? { width: w, height: h, depth: d }
          : undefined;

      const res = await fetch("/api/estimate-dimensions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomImagePath: path,
          productName: getValues("name") || undefined,
          category: getValues("category") || "other",
          target: "available",
          polygonPoints: points.length ? points : undefined,
          productDimensions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Estimation failed.");
      if (data.available) {
        setValue("availableWidth", data.available.width, { shouldValidate: true });
        setValue("availableHeight", data.available.height, { shouldValidate: true });
        setValue("availableDepth", data.available.depth, { shouldValidate: true });
        setValue("dontKnow", false); // we now have (estimated) numbers to work with
        setAvailableEstimated(true);
      }
      applyEstimateInfo(data);
    } catch (err) {
      setEstimateError(err instanceof Error ? err.message : "Estimation failed.");
    } finally {
      setEstimatingAvailable(false);
    }
  }

  async function goNext() {
    if (step === 1) {
      if (!roomFile) {
        setSubmitError("Please upload a room photo to continue.");
        return;
      }
      setSubmitError(null);
      try {
        await ensureRoomUploaded();
      } catch (e) {
        setSubmitError(
          e instanceof Error ? `Upload failed: ${e.message}` : "We couldn't upload that image."
        );
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      const ok = await trigger(["name", "category", "width", "height", "depth"]);
      if (ok) setStep(3);
      return;
    }
  }

  function goBack() {
    setSubmitError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const path = await ensureRoomUploaded();
      if (!path) {
        setStep(1);
        throw new Error("Please upload a room photo.");
      }

      const aiEstimated = productEstimated || availableEstimated;
      const body = {
        roomImagePath: path,
        product: {
          sourceUrl: values.sourceUrl || undefined,
          name: values.name,
          category: values.category,
          width: values.width,
          height: values.height,
          depth: values.depth,
          unit: values.unit || "inches",
          imageUrl: values.imageUrl || undefined,
          clearanceNotes: values.clearanceNotes || undefined,
        },
        measurement: {
          polygonPoints: points.length ? points : undefined,
          availableWidth: values.dontKnow ? undefined : values.availableWidth,
          availableHeight: values.dontKnow ? undefined : values.availableHeight,
          availableDepth: values.dontKnow ? undefined : values.availableDepth,
          unit: values.unit || "inches",
          confidence: values.dontKnow ? "LOW" : values.confidence,
          dontKnow: values.dontKnow,
          dimensionSource: aiEstimated ? "ai_estimated" : "user_entered",
        },
      };

      const res = await fetch("/api/fit-check/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not create the fit check.");
      router.push(`/fit-check/${json.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  };

  const visionLabel =
    providers?.vision === "mock"
      ? "heuristic (no API key configured)"
      : `${providers?.vision} vision`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">New Fit Check</h1>
        <p className="mt-1 text-slate-600">
          Three quick steps. Everything stays an estimate until you confirm real measurements.
        </p>
      </div>

      <StepIndicator step={step} />

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* ---- STEP 1: ROOM PHOTO ---- */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Step 1 — Upload your room photo</CardTitle>
              <CardDescription>
                A clear, straight-on photo of the space works best (kitchen wall, niche, opening).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label
                htmlFor="room-photo"
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center transition-colors hover:border-indigo-400 hover:bg-indigo-50/40"
              >
                <Upload className="h-8 w-8 text-slate-400" />
                <span className="text-sm font-medium text-slate-700">
                  {roomFile ? "Choose a different photo" : "Click to upload a room photo"}
                </span>
                <span className="text-xs text-slate-500">PNG, JPG, WEBP or GIF · up to 10 MB</span>
                <input
                  id="room-photo"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleFile}
                />
              </label>

              {roomPreview && (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={roomPreview} alt="Room preview" className="max-h-80 w-full object-contain bg-slate-100" />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ---- STEP 2: PRODUCT ---- */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Step 2 — Add the product</CardTitle>
              <CardDescription>
                Paste a product URL to auto-fill specs, enter them manually, or let AI estimate
                them. Auto-filled and AI-estimated values are suggestions — please confirm.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm">
                <button
                  type="button"
                  onClick={() => setProductMode("url")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors",
                    productMode === "url" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600"
                  )}
                >
                  <Link2 className="h-4 w-4" /> Paste URL
                </button>
                <button
                  type="button"
                  onClick={() => setProductMode("manual")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors",
                    productMode === "manual"
                      ? "bg-white text-indigo-700 shadow-sm"
                      : "text-slate-600"
                  )}
                >
                  <Pencil className="h-4 w-4" /> Manual entry
                </button>
              </div>

              {productMode === "url" && (
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <Label htmlFor="parse-url">Product page URL</Label>
                  <div className="flex gap-2">
                    <Input
                      id="parse-url"
                      placeholder="https://store.example.com/product/123"
                      value={urlToParse}
                      onChange={(e) => setUrlToParse(e.target.value)}
                    />
                    <Button type="button" onClick={handleParseUrl} disabled={parsing}>
                      {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Fetch details"}
                    </Button>
                  </div>
                  {parseConfidence && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs text-slate-500">Extraction confidence:</span>
                      <Badge
                        variant={
                          parseConfidence === "high"
                            ? "success"
                            : parseConfidence === "medium"
                            ? "warning"
                            : "secondary"
                        }
                      >
                        {parseConfidence}
                      </Badge>
                    </div>
                  )}
                  {parseNotes?.map((note, i) => (
                    <p key={i} className="text-xs text-slate-500">
                      {note}
                    </p>
                  ))}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Product name" error={errors.name?.message} className="sm:col-span-2">
                  <Input placeholder="e.g. French Door Refrigerator" {...register("name")} />
                </Field>

                <Field label="Category" error={errors.category?.message}>
                  <select
                    className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    {...register("category")}
                  >
                    <option value="">Select a category…</option>
                    {CATEGORY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Units">
                  <select
                    className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    {...register("unit")}
                  >
                    <option value="inches">inches</option>
                    <option value="cm">cm</option>
                  </select>
                </Field>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">Dimensions</span>
                <AiEstimateButton
                  onClick={estimateProduct}
                  loading={estimatingProduct}
                  label="Estimate product size with AI"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Width" error={errors.width?.message}>
                  <Input type="number" step="any" placeholder="35.75" {...register("width", { valueAsNumber: true })} />
                </Field>
                <Field label="Height" error={errors.height?.message}>
                  <Input type="number" step="any" placeholder="70" {...register("height", { valueAsNumber: true })} />
                </Field>
                <Field label="Depth" error={errors.depth?.message}>
                  <Input type="number" step="any" placeholder="31.5" {...register("depth", { valueAsNumber: true })} />
                </Field>
              </div>

              {productEstimated && <EstimatedBadge />}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Product image URL (optional)" error={errors.imageUrl?.message}>
                  <Input placeholder="https://…/image.jpg" {...register("imageUrl")} />
                </Field>
                <Field label="Clearance notes (optional)">
                  <Textarea
                    placeholder="e.g. manufacturer requires 1 inch rear clearance for water line"
                    {...register("clearanceNotes")}
                  />
                </Field>
              </div>

              <EstimatePanel info={estimateInfo} error={estimateError} visionLabel={visionLabel} />
            </CardContent>
          </Card>
        )}

        {/* ---- STEP 3: PLACEMENT & MEASUREMENTS ---- */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Step 3 — Mark the area & enter measurements</CardTitle>
              <CardDescription>
                Outline the opening on your photo, then enter the available space — or let AI
                estimate it from the photo. Your measurements always override the estimate.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {roomPreview ? (
                <ImageAnnotationCanvas
                  imageSrc={roomPreview}
                  points={points}
                  onChange={setPoints}
                />
              ) : (
                <div className="flex items-center gap-2 rounded-lg bg-slate-100 p-4 text-sm text-slate-500">
                  <ImageIcon className="h-4 w-4" /> Go back to Step 1 to add a room photo.
                </div>
              )}

              <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <input type="checkbox" className="mt-1 h-4 w-4" {...register("dontKnow")} />
                <span className="text-sm text-slate-700">
                  <span className="font-medium">I don&rsquo;t know the available dimensions.</span>{" "}
                  We&rsquo;ll mark this as <em>Need more data</em> — or use{" "}
                  <span className="font-medium text-indigo-700">Estimate with AI</span> below to get a
                  best-guess verdict (capped at low confidence).
                </span>
              </label>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">Available space</span>
                <AiEstimateButton
                  onClick={estimateAvailable}
                  loading={estimatingAvailable || uploading}
                  label="Estimate available space with AI"
                />
              </div>

              <fieldset disabled={dontKnow} className={cn("grid gap-4 sm:grid-cols-3", dontKnow && "opacity-50")}>
                <Field label="Available width" error={errors.availableWidth?.message}>
                  <Input type="number" step="any" placeholder="40" {...register("availableWidth", { valueAsNumber: true })} />
                </Field>
                <Field label="Available height" error={errors.availableHeight?.message}>
                  <Input type="number" step="any" placeholder="74" {...register("availableHeight", { valueAsNumber: true })} />
                </Field>
                <Field label="Available depth" error={errors.availableDepth?.message}>
                  <Input type="number" step="any" placeholder="36" {...register("availableDepth", { valueAsNumber: true })} />
                </Field>
              </fieldset>

              {availableEstimated && <EstimatedBadge />}

              <Field label="How confident are you in these measurements?">
                <select
                  className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  {...register("confidence")}
                >
                  {CONFIDENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>

              <EstimatePanel info={estimateInfo} error={estimateError} visionLabel={visionLabel} />

              <Disclaimer />
            </CardContent>
          </Card>
        )}

        {submitError && (
          <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{submitError}</p>
        )}

        {/* ---- NAV ---- */}
        <div className="mt-6 flex items-center justify-between">
          <Button type="button" variant="ghost" onClick={goBack} disabled={step === 1 || submitting}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          {step < 3 ? (
            <Button type="button" onClick={goNext} disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  Next <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          ) : (
            <Button type="submit" variant="success" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking fit…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Check fit
                </>
              )}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function AiEstimateButton({
  onClick,
  loading,
  label,
}: {
  onClick: () => void;
  loading: boolean;
  label: string;
}) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
      {label}
    </Button>
  );
}

function EstimatedBadge() {
  return (
    <div className="flex items-center gap-2">
      <Badge variant="info">
        <Sparkles className="h-3 w-3" /> AI-estimated
      </Badge>
      <span className="text-xs text-slate-500">
        Please confirm or adjust — the verdict will be capped at low confidence.
      </span>
    </div>
  );
}

function EstimatePanel({
  info,
  error,
  visionLabel,
}: {
  info: EstimateInfo | null;
  error: string | null;
  visionLabel: string;
}) {
  if (error) {
    return <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>;
  }
  if (!info) {
    return (
      <p className="text-xs text-slate-400">
        AI estimation uses <span className="font-medium">{visionLabel}</span>. Configure
        VISION_PROVIDER + an API key for photo-aware estimates.
      </p>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/50 p-4 text-sm">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-indigo-600" />
        <span className="font-medium text-indigo-900">
          AI estimate ({info.provider}
          {info.isHeuristic ? ", heuristic" : ""}) · {info.confidence} confidence
        </span>
      </div>
      <p className="text-slate-700">{info.reasoning}</p>
      {info.assumptions.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-500">
          {info.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEP_TITLES.map((title, i) => {
        const index = i + 1;
        const active = step === index;
        const done = step > index;
        return (
          <li key={title} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                done
                  ? "bg-emerald-600 text-white"
                  : active
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-200 text-slate-500"
              )}
            >
              {done ? <CheckCircle2 className="h-5 w-5" /> : index}
            </span>
            <span
              className={cn(
                "hidden text-sm font-medium sm:inline",
                active ? "text-slate-900" : "text-slate-500"
              )}
            >
              {title}
            </span>
            {index < STEP_TITLES.length && (
              <span
                className={cn("mx-1 h-0.5 flex-1 rounded", done ? "bg-emerald-600" : "bg-slate-200")}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Field({
  label,
  error,
  children,
  className,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
