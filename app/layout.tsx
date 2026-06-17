import type { Metadata } from "next";
import Link from "next/link";
import { ScanSearch } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "FitVision AI — Estimated fit checks for your space",
  description:
    "Upload a room photo, add a product, mark the placement area, and get an estimated fit verdict with confidence, clearances, and an AI-style preview. Estimates only — not an installer guarantee.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: some browser extensions inject attributes onto
    // <html>/<body> before React hydrates (e.g. rtrvr-*, grammarly, etc.),
    // which would otherwise trigger a one-level attribute hydration mismatch.
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen" suppressHydrationWarning>
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
                <ScanSearch className="h-5 w-5" />
              </span>
              <span className="text-lg font-semibold tracking-tight">
                FitVision<span className="text-indigo-600"> AI</span>
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-sm font-medium text-slate-600">
              <Link href="/" className="hidden hover:text-slate-900 sm:inline">
                Home
              </Link>
              <Link
                href="/fit-check/new"
                className="rounded-lg bg-indigo-600 px-3 py-2 text-white transition-colors hover:bg-indigo-700"
              >
                Start Fit Check
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-slate-500 sm:px-6">
            <p>
              © {new Date().getFullYear()} FitVision AI. Fit checks are{" "}
              <span className="font-medium text-slate-700">estimates</span>, not installer
              guarantees. Always verify measurements and installation requirements before purchase.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
