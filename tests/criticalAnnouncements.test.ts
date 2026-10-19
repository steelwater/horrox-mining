import { describe, expect, it } from 'vitest'
import { advanceFacility, commissionFacility, createInitialState, recordAbsenceTranscript } from '../src/game/engine'
import { decideRepair, detectFault, escalateFault, faultLibrary, repairOptions } from '../src/game/repairs'
import type { FaultType } from '../src/game/types'

const start = 1_800_000_000_000
const minute = 60_000
function operation() {
  const state = createInitialState(start)
  commissionFacility(state, start)
  state.nextRepairId = 2
  return state
}

describe('critical announcements and emergency resolution', () => {
  it.each(['hull-damage', 'power-instability'] as const)('%s explicitly starts autonomous safety while keeping diagnostics available', (type) => {
    const state = operation()
    const vessel = state.vessels[0]!
    const fault = detectFault(state, vessel.id, type, start)!
    const announcement = state.operations[0]!
    expect(announcement.summary).toContain('Facility Control is initiating the predefined safe response immediately.')
    expect(announcement.summary).toContain('No Captain decision is required')
    expect(announcement.summary).not.toContain('requesting service')
    expect(announcement.summary).not.toContain('Press 3 for vessel support')
    expect(announcement.resolution).toBe('autonomous')
    expect(announcement.actionRequested).toBe(false)
    expect(fault.decisionAt).toBeNull()
    const response = state.operations.find((event) => event.repair?.jobId)!
    expect(response.id).not.toBe(announcement.id)
    expect(response.timestamp).toBe(start)
    expect(response.source).toBe('facility')
    expect(state.repairJobs[0]?.createdAt).toBe(start)
    expect(repairOptions(state, vessel, fault)['1']?.action).toBe('diagnostics')
    expect(decideRepair(state, vessel, fault, 'diagnostics', start + 1)).toContain('Required:')
    recordAbsenceTranscript(state, Number(announcement.id.slice(3)))
    expect(state.transcript.some((entry) => entry.text.includes('initiating the predefined safe response immediately'))).toBe(true)
    expect(state.transcript.some((entry) => entry.text.includes('Press 3 for vessel support'))).toBe(false)
  })

  it.each(['deployed', 'returning', 'docked'] as const)('uses actual %s location in hull reports and subsequent diagnostics', (location) => {
    const state = operation()
    const vessel = state.vessels[0]!
    vessel.dockingState = location
    const fault = detectFault(state, vessel.id, 'hull-damage', start)!
    const initial = state.operations[0]!.summary
    const expected = location === 'docked' ? 'Priority structural inspection and dockside repair required.' : 'Priority return and docking required.'
    expect(initial).toContain(expected)
    expect(initial).not.toContain('request priority docking')
    expect(decideRepair(state, vessel, fault, 'diagnostics', start)).toContain(expected)
    if (location !== 'docked') {
      advanceFacility(state, start + 3 * minute)
      expect(vessel.dockingState).toBe('docked')
      expect(decideRepair(state, vessel, fault, 'diagnostics', start + 3 * minute)).toContain('Priority structural inspection and dockside repair required.')
    }
  })

  it.each((Object.keys(faultLibrary) as FaultType[]).filter((type) => faultLibrary[type].severity !== 'critical'))('preserves the ordinary %s request and five-minute window', (type) => {
    const state = operation()
    const vessel = state.vessels[0]!
    const fault = detectFault(state, vessel.id, type, start)!
    expect(state.operations[0]!.summary).toContain('Press 3 for vessel support; 1 for urgent incidents.')
    expect(state.operations[0]!.summary).not.toContain('initiating the predefined safe response immediately')
    expect(fault.decisionAt).toBe(start + 5 * minute)
    expect(state.repairJobs).toHaveLength(0)
  })

  it.each([false, true])('emits 390 for disabled recovery only when the ordinary thruster fault becomes OFFLINE: %s', (disabled) => {
    const state = operation()
    const vessel = state.vessels[0]!
    const fault = detectFault(state, vessel.id, 'thruster-malfunction', start)!
    expect(fault.severity).toBe('fault')
    if (disabled) escalateFault(state, vessel, fault, start, true)
    expect(fault.emergency).toBe(disabled)
    decideRepair(state, vessel, fault, 'crew', start)
    expect(state.operations.some((event) => event.operationCode === 390)).toBe(false)
    advanceFacility(state, start + 11 * minute)
    const resolved = state.operations.filter((event) => event.operationCode === 390)
    expect(resolved).toHaveLength(disabled ? 1 : 0)
    if (disabled) expect(resolved[0]?.repair).toMatchObject({ severity: 'offline', outcome: 'restored' })
  })
})
