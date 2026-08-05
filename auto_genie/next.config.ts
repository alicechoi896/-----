import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse -> pdfjs-dist -> @napi-rs/canvas resolves its native binary via
  // a platform-dependent require() at runtime (process.platform/arch), which
  // Turbopack's static bundling can't trace correctly — it was crashing in
  // production ("ReferenceError: DOMMatrix is not defined") because the
  // Linux binary never made it into the deployed function. Excluding these
  // from bundling lets Vercel's own file tracer include node_modules as-is
  // and Node's native require() resolve the binary correctly at runtime.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
};

export default nextConfig;
