import type { StaffWithSkills } from "@/lib/types/database"

export interface StaffSkillSets {
  certified: Set<string>
  training: Set<string>
}

export function getStaffSkills(s: StaffWithSkills): StaffSkillSets {
  const certified = new Set<string>()
  const training = new Set<string>()
  for (const sk of s.staff_skills) {
    if (sk.level === "certified") certified.add(sk.skill)
    else if (sk.level === "training") training.add(sk.skill)
  }
  return { certified, training }
}

export function isQualified(skills: StaffSkillSets, taskCode: string): boolean {
  return skills.certified.has(taskCode) || skills.training.has(taskCode)
}
