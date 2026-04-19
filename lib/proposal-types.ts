// Single source of truth for AI chat proposals. Imported by both the server
// (app/api/chat/route.ts) and the client (components/chat-panel.tsx) so params
// drift between producer and consumer is caught at compile time.

import type { LabConfigUpdate, RotaRuleInsert, SkillName, SkillLevel, StaffUpdate } from "@/lib/types/database"

export type ProposalParams = {
  generateRota:     { weekStart: string }
  addLeave:         { staffId: string; staffName: string; leaveType: string; startDate: string; endDate: string; notes: string | null }
  addNote:          { weekStart: string; text: string }
  assignStaff:      { weekStart: string; staffId: string; date: string; shiftType: string; functionLabel: string | null }
  regenerateDay:    { weekStart: string; date: string }
  publishRota:      { rotaId: string }
  unlockRota:       { rotaId: string }
  copyPreviousWeek: { weekStart: string }
  updateStaff:      { staffId: string; staffName: string; changes: Pick<StaffUpdate, "days_per_week" | "working_pattern" | "preferred_shift" | "notes" | "onboarding_status"> }
  addSkill:         { staffId: string; staffName: string; skill: SkillName; level: SkillLevel }
  removeSkill:      { staffId: string; staffName: string; skill: SkillName }
  deactivateStaff:  { staffId: string; staffName: string }
  updateCoverage:   LabConfigUpdate
  createRule:       Omit<RotaRuleInsert, "organisation_id">
  toggleRule:       { ruleId: string; enabled: boolean }
  deleteRule:       { ruleId: string }
  approveLeave:     { leaveId: string }
  rejectLeave:      { leaveId: string }
  cancelLeave:      { leaveId: string }
}

export type ProposalAction = keyof ProposalParams

export type Proposal = {
  [K in ProposalAction]: {
    proposal: true
    action: K
    params: ProposalParams[K]
    description: string
  }
}[ProposalAction]

export function propose<A extends ProposalAction>(
  action: A,
  params: ProposalParams[A],
  description: string,
): Extract<Proposal, { action: A }> {
  return { proposal: true, action, params, description } as Extract<Proposal, { action: A }>
}
