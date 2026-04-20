import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/** Uppercase initials from the first two whitespace-separated words of `name`.
 *  Returns `null` when `name` is empty/whitespace so callers can chain an
 *  email-based fallback (`getInitials(name) ?? email.slice(0,2).toUpperCase()`). */
export function getInitials(name: string | null | undefined): string | null {
  if (!name) return null
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return null
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase()
}
