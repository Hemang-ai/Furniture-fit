import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">404</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">We couldn&rsquo;t find that page</h1>
      <p className="mt-2 text-slate-600">
        The fit check may not exist, or the link is incorrect.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/">
          <Button variant="outline">Go home</Button>
        </Link>
        <Link href="/fit-check/new">
          <Button>Start a fit check</Button>
        </Link>
      </div>
    </div>
  );
}
