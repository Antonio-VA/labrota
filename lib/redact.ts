/**
 * Scrub PII-looking tokens and truncate free-form tails before writing a
 * string to logs. Used where third-party error descriptions (Microsoft OAuth,
 * Resend, Supabase) may echo back the caller's email or an opaque correlation
 * ID that would otherwise be retained indefinitely by centralised logging.
 *
 * Not a privacy silver bullet — it only catches the common shapes. Anything
 * headed to a log sink that's already considered sensitive (e.g. cloud
 * provider audit logs) should still be reviewed case-by-case.
 */
export function redactForLog(s: string | null | undefined, maxLen = 200): string {
  if (!s) return ""
  return s
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<redacted-email>")
    .slice(0, maxLen)
}
