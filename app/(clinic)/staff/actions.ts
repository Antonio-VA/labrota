"use server"

// Next.js 16 forbids re-export syntax in "use server" files — only
// directly-declared async functions are allowed. These thin wrappers
// delegate to the split _actions/* submodules while preserving the
// public API that client components import.

import * as _crud from "./_actions/crud"
import * as _bulk from "./_actions/bulk"
import * as _headcount from "./_actions/headcount"

export type { HeadcountResult } from "./_actions/headcount"

export async function createStaff(
  ...args: Parameters<typeof _crud.createStaff>
): ReturnType<typeof _crud.createStaff> {
  return _crud.createStaff(...args)
}

export async function updateStaff(
  ...args: Parameters<typeof _crud.updateStaff>
): ReturnType<typeof _crud.updateStaff> {
  return _crud.updateStaff(...args)
}

export async function deleteStaff(
  ...args: Parameters<typeof _crud.deleteStaff>
): ReturnType<typeof _crud.deleteStaff> {
  return _crud.deleteStaff(...args)
}

export async function bulkAddSkill(
  ...args: Parameters<typeof _bulk.bulkAddSkill>
): ReturnType<typeof _bulk.bulkAddSkill> {
  return _bulk.bulkAddSkill(...args)
}

export async function bulkRemoveSkill(
  ...args: Parameters<typeof _bulk.bulkRemoveSkill>
): ReturnType<typeof _bulk.bulkRemoveSkill> {
  return _bulk.bulkRemoveSkill(...args)
}

export async function bulkAddSkills(
  ...args: Parameters<typeof _bulk.bulkAddSkills>
): ReturnType<typeof _bulk.bulkAddSkills> {
  return _bulk.bulkAddSkills(...args)
}

export async function bulkRemoveSkills(
  ...args: Parameters<typeof _bulk.bulkRemoveSkills>
): ReturnType<typeof _bulk.bulkRemoveSkills> {
  return _bulk.bulkRemoveSkills(...args)
}

export async function bulkUpdateStatus(
  ...args: Parameters<typeof _bulk.bulkUpdateStatus>
): ReturnType<typeof _bulk.bulkUpdateStatus> {
  return _bulk.bulkUpdateStatus(...args)
}

export async function bulkSoftDeleteStaff(
  ...args: Parameters<typeof _bulk.bulkSoftDeleteStaff>
): ReturnType<typeof _bulk.bulkSoftDeleteStaff> {
  return _bulk.bulkSoftDeleteStaff(...args)
}

export async function hardDeleteStaff(
  ...args: Parameters<typeof _bulk.hardDeleteStaff>
): ReturnType<typeof _bulk.hardDeleteStaff> {
  return _bulk.hardDeleteStaff(...args)
}

export async function bulkUpdateStaffField(
  ...args: Parameters<typeof _bulk.bulkUpdateStaffField>
): ReturnType<typeof _bulk.bulkUpdateStaffField> {
  return _bulk.bulkUpdateStaffField(...args)
}

export async function calculateOptimalHeadcount(
  ...args: Parameters<typeof _headcount.calculateOptimalHeadcount>
): ReturnType<typeof _headcount.calculateOptimalHeadcount> {
  return _headcount.calculateOptimalHeadcount(...args)
}
