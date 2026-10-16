import { afterEach, describe, expect, it, vi } from 'vitest'
import { advanceFacility, commissionFacility, createInitialState, recordOperation, returnBriefing } from '../src/game/engine'
import { decideRepair, detectFault, repairOptions } from '../src/game/repairs'
import { criticalPlaytestEnabled } from '../src/game/playtest'

const start = 1_800_000_000_000
const minute = 60_000
function operation() {
  const state = createInitialState(start)
  commissionFacility(state, start)
  return state
}
afterEach(() => vi.unstubAllEnvs())

describe('location-aware dock service', () => {
  it('services an already-docked vessel after berth clearance without replaying arrival', () => {
    const state = operation()
    const vessel = state.vessels[0]!
    vessel.dockingState = 'docked'
    state.systems.berth = 'isolated'
    state.systems.berthInspectionAt = start + 5 * minute
    const fault = detectFault(state, vessel.id, 'drill-wear', start)!
    decideRepair(state, vessel, fault, 'dock', start)
    expect(state.repairJobs[0]?.state).toBe('waiting')
    advanceFacility(state, start + 5 * minute)
    expect(state.repairJobs[0]?.serviceStartedAt).toBe(start + 5 * minute)
    expect(state.operations.filter((event) => event.repair?.jobId).map((event) => event.operationCode)).toEqual([235, 230])
  })

  it.each(['returning-vessel', 'docking'] as const)('resumes a legacy %s job already at dock without new arrival reports', (phase) => {
    const state = operation()
    const vessel = state.vessels[0]!
    detectFault(state, vessel.id, 'hull-damage', start)
    const job = state.repairJobs[0]!
    vessel.dockingState = 'docked'
    job.state = phase
    job.nextAt = start + minute
    const firstNewId = state.nextOperationId
    advanceFacility(state, start + minute)
    expect(job.serviceStartedAt).toBe(start + minute)
    expect(state.operations.filter((event) => Number(event.id.slice(3)) >= firstNewId && event.repair).map((event) => event.operationCode)).toEqual([230])
  })

  it('finishes a real approach without issuing another recall or approach event', () => {
    const state = operation()
    const vessel = state.vessels[0]!
    const fault = detectFault(state, vessel.id, 'sensor-degradation', start)!
    vessel.dockingState = 'approaching'
    decideRepair(state, vessel, fault, 'dock', start)
    expect(state.repairJobs[0]?.state).toBe('docking')
    expect(state.repairJobs[0]?.serviceStartedAt).toBeNull()
    advanceFacility(state, start + minute)
    expect(state.operations.filter((event) => event.repair?.jobId).map((event) => event.operationCode)).toEqual([235, 140, 230])
  })
})

describe('long-absence Captain summary', () => {
  it('reports productive totals alongside service, faults and current state after two hours', () => {
    const state = operation()
    state.nextRepairId = 2
    advanceFacility(state, start + 120 * minute)
    const report = returnBriefing(state, start, start + 120 * minute)
    expect(report).toContain('6 extraction runs completed; 72 tonnes delivered; 72 tonnes processed.')
    expect(report).toContain('0 corrective repairs and 1 routine service completed.')
    expect(report).toContain('0 vessel faults reported')
    expect(report).toContain('Current state:')
    expect(report).not.toContain('assigned to routine service')
  })

  it('keeps pending decisions visible without suppressing the long productive summary', () => {
    const state = operation()
    state.nextRepairId = 2
    advanceFacility(state, start + 60 * minute)
    detectFault(state, state.vessels[0]!.id, 'communications-failure', start + 60 * minute)
    const report = returnBriefing(state, start, start + 60 * minute)
    expect(report).toContain('3 extraction runs completed; 36 tonnes delivered; 36 tonnes processed.')
    expect(report).toContain('1 request awaiting your decision. Press 3 for vessel support.')
    expect(report).toContain('Communications failure')
    expect(report).not.toContain('No captain decision is pending')
  })

  it('labels incomplete retained-history totals instead of claiming the entire absence', () => {
    const state = operation()
    for (let i = 0; i < 1005; i++) recordOperation(state, { timestamp: start + (i + 1) * 1000, source: 'facility', category: 'maintenance', summary: 'Inspection report.', relatedIds: [], actionRequested: false, resolution: 'autonomous', reason: null })
    expect(returnBriefing(state, start, start + 120 * minute)).toContain('totals cover retained records')
  })

  it('excludes events outside the absence interval and retains the concise short reconnect path', () => {
    const state = operation()
    state.nextRepairId = 2
    advanceFacility(state, start + 120 * minute)
    expect(returnBriefing(state, start + 60 * minute, start + 120 * minute)).toContain('3 extraction runs completed; 36 tonnes delivered; 36 tonnes processed.')
    detectFault(state, state.vessels[0]!.id, 'communications-failure', start + 120 * minute)
    const short = returnBriefing(state, start + 119 * minute, start + 120 * minute)
    expect(short).toContain('service request awaiting your decision')
    expect(short).not.toContain('extraction runs completed')
  })
})

describe('explicit critical playtest build', () => {
  it.each(['production', 'development', 'test'])('keeps ordinary balancing in %s mode', (mode) => {
    vi.stubEnv('MODE', mode)
    expect(criticalPlaytestEnabled()).toBe(false)
    const state = operation()
    advanceFacility(state, start + 120 * minute)
    expect(state.operations.some((event) => event.repair?.severity === 'critical')).toBe(false)
  })

  it.each([0, 3, 7, 12, 17, 23, 100])('reaches a critical fault within two hours from saved operating run %i', (runs) => {
    vi.stubEnv('MODE', 'playtest')
    const state = operation()
    const vessel = state.vessels[0]!
    vessel.operatingRuns = runs
    vessel.cut = 'dense'
    vessel.completesAt = start + 20 * minute
    advanceFacility(state, start + 120 * minute)
    const fault = vessel.activeFaults.find((entry) => entry.severity === 'critical')
    expect(fault).toBeDefined()
    expect(fault!.detectedAt - start).toBeLessThanOrEqual(120 * minute)
  })

  it('produces an autonomous critical recovery within two hours while retaining ordinary faults', () => {
    vi.stubEnv('MODE', 'playtest')
    expect(criticalPlaytestEnabled()).toBe(true)
    const state = operation()
    advanceFacility(state, start + 120 * minute)
    const fault = state.vessels[0]!.activeFaults.find((entry) => entry.severity === 'critical')!
    expect(fault).toBeDefined()
    expect(fault.detectedAt - start).toBeLessThan(90 * minute)
    const job = state.repairJobs.find((entry) => entry.faultId === fault.id)!
    expect(job.createdAt).toBe(fault.detectedAt)
    expect(fault.decisionAt).toBeNull()
    expect(state.operations.some((event) => event.repair?.severity === 'degraded')).toBe(true)
    expect(state.operations.some((event) => event.operationCode === 390)).toBe(true)
    const stateAtFault = operation()
    advanceFacility(stateAtFault, fault.detectedAt)
    const active = stateAtFault.vessels[0]!.activeFaults.find((entry) => entry.severity === 'critical')!
    expect(repairOptions(stateAtFault, stateAtFault.vessels[0]!, active)['1']?.action).toBe('diagnostics')
    const report = returnBriefing(state, start, start + 120 * minute)
    expect(report).toContain('corrective repairs')
    expect(report).toContain('autonomous responses')
  })
})
