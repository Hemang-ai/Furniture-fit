import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ArrowLeft,
  Package,
  Ruler,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import type { FitReport } from "@/lib/fitEngine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Disclaimer } from "@/components/Disclaimer";
import { GeneratePreviewButton } from "@/components/GeneratePreviewButton";
import { VERDICT_DISPLAY, CONFIDENCE_DISPLAY } from "@/lib/verdictDisplay";
import { formatNumber, cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const VERDICT_ICONS = {
  check: CheckCircle2,
  alert: AlertTriangle,
  x: XCircle,
  help: HelpCircle,
} as const;

export default async function FitCheckResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const fitCheck = await prisma.fitCheck.findUnique({
    where: { id },
    include: { product: true, measurement: true },
  });

  if (!fitCheck || !fitCheck.fitReportJson) {
    notFound();
  }

  const report = JSON.parse(fitCheck.fitReportJson) as FitReport;
  const verdict = VERDICT_DISPLAY[report.verdict];
  const confidence = CONFIDENCE_DISPLAY[report.confidence];
  const VerdictIcon = VERDICT_ICONS[verdict.iconName];
  const unit = fitCheck.product.unit || "inches";

  const p = report.productDimensions;
  const a = report.availableDimensions;
  const rules = report.requiredClearances;
  const aiEstimated = fitCheck.measurement.calibrationMethod === "ai_estimated";

  const clearanceRows =
    report.verdict === "NEED_MORE_DATA"
      ? []
      : [
          { label: "Left side", space: report.margins.sideLeft, required: rules.side },
          { label: "Right side", space: report.margins.sideRight, required: rules.side },
          { label: "Top", space: report.margins.top, required: rules.top },
          { label: "Rear (depth)", space: report.margins.rear, required: rules.rear },
        ].map((row) => ({ ...row, slack: Math.round((row.space - row.required) * 100) / 100 }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/fit-check/new"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> Start another fit check
      </Link>

      {/* Verdict hero */}
      <Card className={cn("border-2", verdict.heroClass)}>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <VerdictIcon className="h-12 w-12 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium uppercase tracking-wide opacity-70">
                Estimated verdict
              </div>
              <h1 className="text-3xl font-bold tracking-tight">{verdict.label}</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={verdict.badgeVariant} className="px-3 py-1 text-sm">
              {verdict.label}
            </Badge>
            <Badge variant={confidence.badgeVariant} className="px-3 py-1 text-sm">
              {confidence.label}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {aiEstimated && (
        <div className="flex items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
          <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-600" />
          <p>
            One or more dimensions in this check were <strong>AI-estimated from the photo and
            product type</strong>, not measured. Confidence is capped at <strong>Low</strong>.
            Confirm real measurements before purchase.
          </p>
        </div>
      )}

      {/* Plain-English summary */}
      <Card>
        <CardContent className="p-6">
          <p className="leading-relaxed text-slate-700">{report.plainEnglishSummary}</p>
        </CardContent>
      </Card>

      {/* Room image + AI preview */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your room</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fitCheck.roomImagePath}
                alt="Room"
                className="w-full bg-slate-100 object-contain"
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>AI-style preview</CardTitle>
          </CardHeader>
          <CardContent>
            <GeneratePreviewButton
              fitCheckId={fitCheck.id}
              initialPreviewPath={fitCheck.generatedPreviewPath}
              roomImagePath={fitCheck.roomImagePath}
            />
          </CardContent>
        </Card>
      </div>

      {/* Dimensions */}
      <div className="grid gap-4 md:grid-cols-2">
        <DimensionCard
          title="Product"
          icon={<Package className="h-5 w-5 text-indigo-600" />}
          name={fitCheck.product.name}
          dims={p}
          unit={unit}
        />
        <DimensionCard
          title="Available space"
          icon={<Ruler className="h-5 w-5 text-emerald-600" />}
          name={`Measurement confidence: ${fitCheck.measurement.confidence}`}
          dims={a}
          unit={unit}
        />
      </div>

      {/* Clearance analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-slate-500" /> Clearance analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          {report.verdict === "NEED_MORE_DATA" ? (
            <p className="text-sm text-slate-600">
              We need the product and available-space dimensions before we can analyze clearances.
              Start a new fit check and enter measurements (or uncheck “I don’t know”).
            </p>
          ) : (
            <>
              <p className="mb-4 text-sm text-slate-500">
                Assumed clearance requirements for this category:{" "}
                <span className="font-medium text-slate-700">
                  {rules.side}&quot; sides · {rules.top}&quot; top · {rules.rear}&quot; rear
                </span>
                . These are editable assumptions — confirm against the product manual.
              </p>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Dimension</th>
                      <th className="px-4 py-2 font-medium">Space left</th>
                      <th className="px-4 py-2 font-medium">Required</th>
                      <th className="px-4 py-2 font-medium">Slack</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clearanceRows.map((row) => {
                      const ok = row.slack >= 0;
                      return (
                        <tr key={row.label}>
                          <td className="px-4 py-2 font-medium text-slate-700">{row.label}</td>
                          <td className="px-4 py-2 text-slate-600">
                            {formatNumber(row.space)}
                            {unit === "inches" ? '"' : ` ${unit}`}
                          </td>
                          <td className="px-4 py-2 text-slate-600">
                            {formatNumber(row.required)}
                            {unit === "inches" ? '"' : ` ${unit}`}
                          </td>
                          <td
                            className={cn(
                              "px-4 py-2 font-semibold",
                              ok ? "text-emerald-700" : "text-rose-700"
                            )}
                          >
                            {row.slack >= 0 ? "+" : ""}
                            {formatNumber(row.slack)}
                          </td>
                          <td className="px-4 py-2">
                            <Badge variant={ok ? "success" : "destructive"}>
                              {ok ? "OK" : "Exceeds"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Warnings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" /> Warnings & things we didn&rsquo;t check
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {report.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" />
                {w}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Prominent disclaimer */}
      <Disclaimer prominent />
    </div>
  );
}

function DimensionCard({
  title,
  icon,
  name,
  dims,
  unit,
}: {
  title: string;
  icon: React.ReactNode;
  name: string;
  dims: { width: number; height: number; depth: number } | null;
  unit: string;
}) {
  const u = unit === "inches" ? '"' : ` ${unit}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-slate-500">{name}</p>
        {dims ? (
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Width", value: dims.width },
              { label: "Height", value: dims.height },
              { label: "Depth", value: dims.depth },
            ].map((d) => (
              <div key={d.label} className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">{d.label}</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {formatNumber(d.value)}
                  {u}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
            Not provided (marked as unknown).
          </p>
        )}
      </CardContent>
    </Card>
  );
}
