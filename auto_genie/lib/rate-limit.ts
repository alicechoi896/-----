import "server-only";

/**
 * In-memory sliding-window rate limiter, scoped to this Node process. This is
 * sufficient for a single-instance prototype; a production multi-instance
 * deployment would move this state to Redis/Supabase, but the call sites
 * (server actions keyed by "action:organizationId") stay the same either way.
 */

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;

export interface RateLimitResult {
  ok: boolean;
  message: string;
}

export async function checkRateLimit(
  key: string,
  maxRequests: number = MAX_REQUESTS_PER_WINDOW,
  windowMs: number = WINDOW_MS
): Promise<RateLimitResult> {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= maxRequests) {
    return { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return { ok: true, message: "" };
}
