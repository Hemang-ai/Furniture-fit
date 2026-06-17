"use client";

import * as React from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GeneratePreviewButtonProps {
  fitCheckId: string;
  initialPreviewPath?: string | null;
  roomImagePath: string;
}

export function GeneratePreviewButton({
  fitCheckId,
  initialPreviewPath,
  roomImagePath,
}: GeneratePreviewButtonProps) {
  const [preview, setPreview] = React.useState<string | null>(initialPreviewPath ?? null);
  const [isPlaceholder, setIsPlaceholder] = React.useState<boolean>(
    !initialPreviewPath || initialPreviewPath === roomImagePath
  );
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fit-check/${fitCheckId}/generate-preview`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Preview generation failed.");
      setPreview(json.path);
      setIsPlaceholder(Boolean(json.isPlaceholder));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview generation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" onClick={generate} disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Generating preview…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" /> {preview ? "Regenerate preview" : "Generate Preview"}
          </>
        )}
      </Button>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {preview && (
        <div className="relative overflow-hidden rounded-xl border border-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="AI preview" className="w-full bg-slate-100 object-contain" />
          {isPlaceholder && (
            <span className="absolute left-3 top-3 rounded-md bg-slate-900/80 px-2.5 py-1 text-xs font-semibold text-white">
              AI preview placeholder
            </span>
          )}
        </div>
      )}
      {preview && isPlaceholder && (
        <p className="text-xs text-slate-500">
          Preview generation is running in mock mode (showing your original photo). Set
          IMAGE_GENERATION_PROVIDER to <code>openai</code> or <code>gemini</code> with the matching
          API key to generate a real visualization. Any generated image is an AI visualization, not
          a measurement guarantee.
        </p>
      )}
    </div>
  );
}
