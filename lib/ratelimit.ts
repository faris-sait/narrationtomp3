// In-memory sliding-window rate limiter for narration generation.
// Single-instance; per-instance on multi-instance deployments (fine for the
// free tier). Configure with RATE_LIMIT_PER_MINUTE and RATE_LIMIT_WINDOW_MS.

const LIMIT_PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 6);
const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);

const hits = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const previous = (hits.get(key) ?? []).filter((t) => t > windowStart);

  if (previous.length >= LIMIT_PER_MINUTE) {
    const oldest = previous[0];
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000)),
    };
  }

  previous.push(now);
  hits.set(key, previous);

  // Opportunistic cleanup so stale keys cannot grow the map without bound.
  if (hits.size > 10_000) {
    for (const [k, times] of hits) {
      if (times.every((t) => t <= windowStart)) hits.delete(k);
    }
  }

  return { allowed: true, remaining: LIMIT_PER_MINUTE - previous.length, retryAfterSeconds: 0 };
}

export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return ip;
}