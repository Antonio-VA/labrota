"use server"

// Next.js 16 forbids re-export syntax in "use server" files — only
// directly-declared async functions are allowed. These thin wrappers
// delegate to the split _hr-actions/* submodules while preserving the
// public API that client components import.

import * as _module from "./_hr-actions/module"
import * as _leaveTypes from "./_hr-actions/leave-types"
import * as _config from "./_hr-actions/config"
import * as _balances from "./_hr-actions/balances"

export async function getHrModuleStatus(
  ...args: Parameters<typeof _module.getHrModuleStatus>
): ReturnType<typeof _module.getHrModuleStatus> {
  return _module.getHrModuleStatus(...args)
}

export async function installHrModule(
  ...args: Parameters<typeof _module.installHrModule>
): ReturnType<typeof _module.installHrModule> {
  return _module.installHrModule(...args)
}

export async function removeHrModule(
  ...args: Parameters<typeof _module.removeHrModule>
): ReturnType<typeof _module.removeHrModule> {
  return _module.removeHrModule(...args)
}

export async function deleteAllHrData(
  ...args: Parameters<typeof _module.deleteAllHrData>
): ReturnType<typeof _module.deleteAllHrData> {
  return _module.deleteAllHrData(...args)
}

export async function getCompanyLeaveTypes(
  ...args: Parameters<typeof _leaveTypes.getCompanyLeaveTypes>
): ReturnType<typeof _leaveTypes.getCompanyLeaveTypes> {
  return _leaveTypes.getCompanyLeaveTypes(...args)
}

export async function createCompanyLeaveType(
  ...args: Parameters<typeof _leaveTypes.createCompanyLeaveType>
): ReturnType<typeof _leaveTypes.createCompanyLeaveType> {
  return _leaveTypes.createCompanyLeaveType(...args)
}

export async function updateCompanyLeaveType(
  ...args: Parameters<typeof _leaveTypes.updateCompanyLeaveType>
): ReturnType<typeof _leaveTypes.updateCompanyLeaveType> {
  return _leaveTypes.updateCompanyLeaveType(...args)
}

export async function archiveCompanyLeaveType(
  ...args: Parameters<typeof _leaveTypes.archiveCompanyLeaveType>
): ReturnType<typeof _leaveTypes.archiveCompanyLeaveType> {
  return _leaveTypes.archiveCompanyLeaveType(...args)
}

export async function restoreCompanyLeaveType(
  ...args: Parameters<typeof _leaveTypes.restoreCompanyLeaveType>
): ReturnType<typeof _leaveTypes.restoreCompanyLeaveType> {
  return _leaveTypes.restoreCompanyLeaveType(...args)
}

export async function mapLegacyLeaveType(
  ...args: Parameters<typeof _leaveTypes.mapLegacyLeaveType>
): ReturnType<typeof _leaveTypes.mapLegacyLeaveType> {
  return _leaveTypes.mapLegacyLeaveType(...args)
}

export async function getHolidayConfig(
  ...args: Parameters<typeof _config.getHolidayConfig>
): ReturnType<typeof _config.getHolidayConfig> {
  return _config.getHolidayConfig(...args)
}

export async function updateHolidayConfig(
  ...args: Parameters<typeof _config.updateHolidayConfig>
): ReturnType<typeof _config.updateHolidayConfig> {
  return _config.updateHolidayConfig(...args)
}

export async function getStaffBalances(
  ...args: Parameters<typeof _balances.getStaffBalances>
): ReturnType<typeof _balances.getStaffBalances> {
  return _balances.getStaffBalances(...args)
}

export async function upsertHolidayBalance(
  ...args: Parameters<typeof _balances.upsertHolidayBalance>
): ReturnType<typeof _balances.upsertHolidayBalance> {
  return _balances.upsertHolidayBalance(...args)
}

export async function generateBalancesForYear(
  ...args: Parameters<typeof _balances.generateBalancesForYear>
): ReturnType<typeof _balances.generateBalancesForYear> {
  return _balances.generateBalancesForYear(...args)
}

export async function rollOverCarryForward(
  ...args: Parameters<typeof _balances.rollOverCarryForward>
): ReturnType<typeof _balances.rollOverCarryForward> {
  return _balances.rollOverCarryForward(...args)
}
