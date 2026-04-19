// Pin a cache object to `window` so it survives Next.js HMR module re-evaluation
// in dev. In SSR contexts each call returns a fresh instance (request-scoped).
export function createWindowCache<T>(key: string, init: () => T): T {
  if (typeof window === "undefined") return init()
  const bag = window as unknown as Record<string, T>
  if (!bag[key]) bag[key] = init()
  return bag[key]
}
