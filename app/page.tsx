import Link from "next/link";
import {
  ArrowRight,
  Upload,
  PackagePlus,
  SquareDashedMousePointer,
  Sparkles,
  ShieldCheck,
  Ruler,
  Gauge,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Disclaimer } from "@/components/Disclaimer";

const STEPS = [
  {
    icon: Upload,
    title: "Upload your room photo",
    body: "Add a photo of the kitchen, wall, or space where the product will go.",
  },
  {
    icon: PackagePlus,
    title: "Add a product",
    body: "Paste a product URL to auto-fill specs, or enter dimensions manually.",
  },
  {
    icon: SquareDashedMousePointer,
    title: "Mark the placement area",
    body: "Click to outline the opening, then enter the available measurements.",
  },
  {
    icon: Sparkles,
    title: "Check fit & preview",
    body: "Get an estimated verdict with clearances, plus an AI-style preview.",
  },
];

const FEATURES = [
  {
    icon: Gauge,
    title: "Confidence on every verdict",
    body: "Each result shows HIGH / MEDIUM / LOW confidence and clearance margins so you know how much to trust it.",
  },
  {
    icon: Ruler,
    title: "Estimates, clearly labeled",
    body: "We never claim exact measurement from a single image. Manual dimensions drive the math; everything else is an estimate.",
  },
  {
    icon: ShieldCheck,
    title: "Clearance-aware",
    body: "Category-specific side, top, and rear clearance assumptions for fridges, ranges, dishwashers, laundry, TVs, and furniture.",
  },
];

export default function HomePage() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="hero-gradient -mx-4 rounded-3xl px-4 py-16 sm:-mx-6 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-700">
            <Sparkles className="h-3.5 w-3.5" /> Estimated fit checks, not installer guarantees
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Will it fit? Find out before you buy.
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Upload your room photo. Add a product. Check fit. Preview the look. FitVision AI gives
            you an estimated fit verdict — with confidence, clearance margins, and an AI-style
            preview.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/fit-check/new"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
            >
              Start Fit Check <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section>
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">How it works</h2>
          <p className="mt-2 text-slate-600">Four quick steps from photo to estimated verdict.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <Card key={step.title} className="relative overflow-hidden">
              <CardContent className="p-6">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <step.icon className="h-6 w-6" />
                </div>
                <div className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                  Step {i + 1}
                </div>
                <h3 className="mt-1 font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600">{step.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Features */}
      <section>
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Built to be honest about uncertainty
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title}>
              <CardContent className="p-6">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-slate-900">{feature.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600">{feature.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Disclaimer */}
      <section className="mx-auto max-w-3xl">
        <Disclaimer prominent />
      </section>
    </div>
  );
}
