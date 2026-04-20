"use server"

// Next.js 16 forbids re-export syntax in "use server" files — only
// directly-declared async functions are allowed. These thin wrappers
// delegate to the split _actions/* submodules while preserving the
// public API that client components import.

import * as _crud from "./_actions/crud"
import * as _attachments from "./_actions/attachments"
import * as _balance from "./_actions/balance"
import * as _workflow from "./_actions/workflow"

export async function createLeave(
  ...args: Parameters<typeof _crud.createLeave>
): ReturnType<typeof _crud.createLeave> {
  return _crud.createLeave(...args)
}

export async function updateLeave(
  ...args: Parameters<typeof _crud.updateLeave>
): ReturnType<typeof _crud.updateLeave> {
  return _crud.updateLeave(...args)
}

export async function quickCreateLeave(
  ...args: Parameters<typeof _crud.quickCreateLeave>
): ReturnType<typeof _crud.quickCreateLeave> {
  return _crud.quickCreateLeave(...args)
}

export async function deleteLeave(
  ...args: Parameters<typeof _crud.deleteLeave>
): ReturnType<typeof _crud.deleteLeave> {
  return _crud.deleteLeave(...args)
}

export async function uploadLeaveAttachment(
  ...args: Parameters<typeof _attachments.uploadLeaveAttachment>
): ReturnType<typeof _attachments.uploadLeaveAttachment> {
  return _attachments.uploadLeaveAttachment(...args)
}

export async function previewLeaveBalance(
  ...args: Parameters<typeof _balance.previewLeaveBalance>
): ReturnType<typeof _balance.previewLeaveBalance> {
  return _balance.previewLeaveBalance(...args)
}

export async function requestLeave(
  ...args: Parameters<typeof _workflow.requestLeave>
): ReturnType<typeof _workflow.requestLeave> {
  return _workflow.requestLeave(...args)
}

export async function approveLeave(
  ...args: Parameters<typeof _workflow.approveLeave>
): ReturnType<typeof _workflow.approveLeave> {
  return _workflow.approveLeave(...args)
}

export async function rejectLeave(
  ...args: Parameters<typeof _workflow.rejectLeave>
): ReturnType<typeof _workflow.rejectLeave> {
  return _workflow.rejectLeave(...args)
}

export async function cancelLeave(
  ...args: Parameters<typeof _workflow.cancelLeave>
): ReturnType<typeof _workflow.cancelLeave> {
  return _workflow.cancelLeave(...args)
}
