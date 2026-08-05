// pdf-parse -> pdfjs-dist references browser canvas globals (DOMMatrix,
// ImageData, Path2D) at module-evaluation time even though this app only
// ever calls getText() (no rendering). @napi-rs/canvas's platform binary
// doesn't reliably make it into the Vercel deployment (its require path is
// computed from process.platform/arch, which static file tracers can miss),
// so pdfjs-dist's own fallback polyfill fails and the bare reference throws
// ReferenceError, crashing the whole module (and everything that imports it)
// on load. Since we never render, harmless stand-ins are enough — this runs
// once at server boot, before any route module evaluates, so it's guaranteed
// to be in place before pdf-parse's own import.
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as Record<string, unknown>;
  if (typeof g.DOMMatrix === "undefined") {
    g.DOMMatrix = class DOMMatrix {};
  }
  if (typeof g.ImageData === "undefined") {
    g.ImageData = class ImageData {};
  }
  if (typeof g.Path2D === "undefined") {
    g.Path2D = class Path2D {};
  }
}
