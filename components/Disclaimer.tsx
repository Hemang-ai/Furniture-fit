import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface DisclaimerProps {
  className?: string;
  /** When true, renders a more prominent (bordered) variant for results pages. */
  prominent?: boolean;
  children?: React.ReactNode;
}

const DEFAULT_TEXT =
  "FitVision AI provides an estimated fit check based on the dimensions and image " +
  "information provided. Always verify measurements and installation requirements " +
  "before purchase. This is not an installer guarantee.";

export function Disclaimer({ className, prominent, children }: DisclaimerProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg text-sm",
        prominent
          ? "border border-amber-300 bg-amber-50 p-4 text-amber-900"
          : "bg-slate-100 p-3 text-slate-600",
        className
      )}
      role="note"
    >
      <Info className={cn("mt-0.5 h-4 w-4 flex-shrink-0", prominent ? "text-amber-600" : "text-slate-400")} />
      <p>{children ?? DEFAULT_TEXT}</p>
    </div>
  );
}
