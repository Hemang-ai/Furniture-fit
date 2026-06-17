import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // This project lives in a worktree; pin the tracing root to avoid Next picking
  // up an unrelated parent lockfile.
  outputFileTracingRoot: __dirname,
  // ESLint is run separately; do not block production builds on lint.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Allow remote product images referenced by <img> tags. We intentionally use
  // plain <img> for user-supplied URLs to avoid next/image remote-domain config.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
