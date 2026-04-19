import type { PostgrestError } from "@supabase/supabase-js"

export type QueryResult<T> = { data: T | null; error: PostgrestError | null }

/**
 * Narrows a Supabase builder's result to a caller-chosen shape. Replaces the
 * `as unknown as Promise<{ data: T | null; error: ... }>` pattern used when
 * the generated Database types don't match the projected shape (custom
 * column lists, joins, or non-table RPCs).
 *
 * Use sparingly — prefer typed `supabase.from()` selects whose return types
 * satisfy the call site. Reach for this only where the inferred types fight
 * the code rather than helping it.
 */
export function typedQuery<T>(
  builder: PromiseLike<{ data: unknown; error: PostgrestError | null }>,
): Promise<QueryResult<T>> {
  return Promise.resolve(builder).then((res) => ({
    data: res.data as T | null,
    error: res.error,
  }))
}
