/**
 * In-memory sliding-window rate limiter.
 * Works well on Vercel Fluid Compute where function instances are reused.
 */

const windowMs = 60_000 // 1 minute window

interface Entry {
  count: number
  resetAt: number
}

const store = new Map<string, Entry>()

// Periodic cleanup to prevent memory leaks
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key)
  }
}, 60_000)

export function rateLimit(
  key: string,
  maxRequests: number,
): { success: boolean; remaining: number } {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { success: true, remaining: maxRequests - 1 }
  }

  entry.count++
  const remaining = Math.max(0, maxRequests - entry.count)
  return { success: entry.count <= maxRequests, remaining }
}

export function rateLimitResponse() {
  return Response.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers: { "Retry-After": "60" } },
  )
}
