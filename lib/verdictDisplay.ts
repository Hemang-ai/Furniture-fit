import type { Verdict, Confidence } from "@/lib/fitEngine";
import type { BadgeProps } from "@/components/ui/badge";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

export interface VerdictDisplay {
  label: string;
  badgeVariant: BadgeVariant;
  /** Tailwind classes for a large hero block. */
  heroClass: string;
  iconName: "check" | "alert" | "x" | "help";
}

export const VERDICT_DISPLAY: Record<Verdict, VerdictDisplay> = {
  FITS: {
    label: "Fits",
    badgeVariant: "success",
    heroClass: "border-emerald-300 bg-emerald-50 text-emerald-900",
    iconName: "check",
  },
  TIGHT_FIT: {
    label: "Tight Fit",
    badgeVariant: "warning",
    heroClass: "border-amber-300 bg-amber-50 text-amber-900",
    iconName: "alert",
  },
  DOES_NOT_FIT: {
    label: "Does Not Fit",
    badgeVariant: "destructive",
    heroClass: "border-rose-300 bg-rose-50 text-rose-900",
    iconName: "x",
  },
  NEED_MORE_DATA: {
    label: "Need More Data",
    badgeVariant: "secondary",
    heroClass: "border-slate-300 bg-slate-50 text-slate-800",
    iconName: "help",
  },
};

export const CONFIDENCE_DISPLAY: Record<Confidence, { label: string; badgeVariant: BadgeVariant }> = {
  HIGH: { label: "High confidence", badgeVariant: "success" },
  MEDIUM: { label: "Medium confidence", badgeVariant: "warning" },
  LOW: { label: "Low confidence", badgeVariant: "secondary" },
};
