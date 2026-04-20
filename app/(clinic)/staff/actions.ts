"use server"

export { createStaff, updateStaff, deleteStaff } from "./_actions/crud"
export {
  bulkAddSkill,
  bulkRemoveSkill,
  bulkAddSkills,
  bulkRemoveSkills,
  bulkUpdateStatus,
  bulkSoftDeleteStaff,
  hardDeleteStaff,
  bulkUpdateStaffField,
} from "./_actions/bulk"
export { calculateOptimalHeadcount } from "./_actions/headcount"
export type { HeadcountResult } from "./_actions/headcount"
