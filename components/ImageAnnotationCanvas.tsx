"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface NormalizedPoint {
  x: number; // 0..1
  y: number; // 0..1
}

interface ImageAnnotationCanvasProps {
  /** Image source (object URL or public path). */
  imageSrc: string;
  /** Current normalized points (0..1). Controlled. */
  points: NormalizedPoint[];
  onChange: (points: NormalizedPoint[]) => void;
  maxPoints?: number;
}

/**
 * Lets a user click N points (default 4) on a room image to mark the opening
 * where a product will go. Coordinates are stored NORMALIZED (0..1) so they
 * survive any resize.
 */
export function ImageAnnotationCanvas({
  imageSrc,
  points,
  onChange,
  maxPoints = 4,
}: ImageAnnotationCanvasProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = React.useState(false);
  const [canvasSize, setCanvasSize] = React.useState({ width: 0, height: 0 });

  // Load the image whenever the source changes.
  React.useEffect(() => {
    setImageLoaded(false);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };
    img.src = imageSrc;
    return () => {
      img.onload = null;
    };
  }, [imageSrc]);

  // Compute canvas size from container width + image aspect ratio.
  React.useEffect(() => {
    function recompute() {
      const img = imageRef.current;
      const container = containerRef.current;
      if (!img || !container) return;
      const width = container.clientWidth;
      const aspect = img.naturalHeight / img.naturalWidth || 0.66;
      setCanvasSize({ width, height: Math.round(width * aspect) });
    }
    if (imageLoaded) recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [imageLoaded]);

  // Draw image + annotations.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !imageLoaded || canvasSize.width === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvasSize;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const pts = points.map((p) => ({ x: p.x * width, y: p.y * height }));

    // Filled polygon overlay when we have 3+ points.
    if (pts.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fillStyle = "rgba(79, 70, 229, 0.25)"; // indigo-600 @ 25%
      ctx.fill();
    }

    // Outline connecting points in order.
    if (pts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (pts.length === maxPoints) ctx.closePath();
      ctx.strokeStyle = "rgba(79, 70, 229, 0.95)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Numbered point markers.
    pts.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(79, 70, 229, 1)";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), p.x, p.y);
    });
  }, [points, imageLoaded, canvasSize, maxPoints]);

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (points.length >= maxPoints) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const clamped = {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    };
    onChange([...points, clamped]);
  }

  const remaining = maxPoints - points.length;

  return (
    <div className="space-y-3">
      <div ref={containerRef} className="w-full overflow-hidden rounded-xl border border-slate-200">
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          style={{ width: "100%", height: canvasSize.height || "auto", cursor: remaining > 0 ? "crosshair" : "default" }}
          className="block bg-slate-100"
          aria-label="Room image annotation canvas"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Mark the opening where the product will go.{" "}
          {remaining > 0 ? (
            <span className="font-medium text-slate-700">
              Click {remaining} more point{remaining === 1 ? "" : "s"} ({points.length}/{maxPoints}).
            </span>
          ) : (
            <span className="font-medium text-emerald-700">All {maxPoints} points marked.</span>
          )}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([])}
          disabled={points.length === 0}
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
      </div>
    </div>
  );
}
