import type { PunctionsByDay } from "@/lib/types/database"

export type SkillRow = { staff_id: string; skill: string; level: string }

export const DOW_TO_KEY: Record<number, keyof PunctionsByDay> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
}
