// Lightweight server-side timing for perf measurement. Set env
// `LABROTA_TIMING=1` to emit `[timing] <label>: <ms>ms` to stderr. Delete the
// `time*()` callsites once the measurement pass is complete.

const ENABLED = process.env.LABROTA_TIMING === "1"

function log(label: string, ms: number) {
  if (!ENABLED) return
  console.log(`[timing] ${label}: ${ms.toFixed(1)}ms`)
}

export async function time<T>(label: string, fn: PromiseLike<T> | (() => PromiseLike<T>)): Promise<T> {
  if (!ENABLED) return typeof fn === "function" ? await fn() : await fn
  const t0 = performance.now()
  try {
    return await (typeof fn === "function" ? fn() : fn)
  } finally {
    log(label, performance.now() - t0)
  }
}

/** Wrap an array of labelled promises so each logs its own duration even
 *  though they run in parallel. Returns a Promise.all-compatible array. */
export function timedParallel<T extends readonly [string, Promise<unknown>][]>(entries: T): {
  [K in keyof T]: T[K] extends readonly [string, Promise<infer R>] ? Promise<R> : never
} {
  if (!ENABLED) return entries.map(([, p]) => p) as never
  return entries.map(([label, p]) => {
    const t0 = performance.now()
    return p.finally(() => log(label, performance.now() - t0))
  }) as never
}

/** Mark a single measurement without wrapping a promise. */
export function mark(label: string, startedAt: number) {
  if (!ENABLED) return
  log(label, performance.now() - startedAt)
}

export const now = () => (ENABLED ? performance.now() : 0)
