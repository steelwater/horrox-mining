import { describe, expect, it } from 'vitest'
import { advanceFacility, commissionFacility, createInitialState, operationalStatus, returnBriefing } from '../src/game/engine'
import { activeFaults, decideRepair, detectFault, faultLibrary, repairOptions } from '../src/game/repairs'
import { exportSave, parseSave } from '../src/game/portableSave'
import type { FacilityState } from '../src/game/types'

const start = 1_800_000_000_000
const minute = 60_000
function operation() {
  const state = createInitialState(start)
  commissionFacility(state, start)
  state.nextRepairId = 2 // Focus on operating wear, without the onboarding sensor incident.
  return state
}
function assertTotals(state: FacilityState) {
  const status = operationalStatus(state)
  const mining = state.vessels.filter((v) => v.assignment === 'extraction' && v.dockingState === 'deployed').length
  const docked = state.vessels.filter((v) => v.dockingState === 'docked').length
  const transit = state.vessels.filter((v) => v.dockingState === 'returning' || v.dockingState === 'approaching')
  const holding = state.vessels.filter((v) => v.dockingState === 'holding')
  expect(status).toContain(`${mining} mining vessel${mining === 1 ? '' : 's'} active.`)
  expect(status).toContain(`${docked} docked.`)
  expect(status).toContain(`${transit.length} in transit${transit.length ? ` (${transit.map((v) => v.name).join(', ')})` : ''}.`)
  expect(status).toContain(`${holding.length} holding${holding.length ? ` (${holding.map((v) => v.name).join(', ')})` : ''}.`)
}

describe('Playtest 1007 operations follow-up', () => {
  it('advances completed run 13 once before repairing and redeploying for run 14', () => {
    const state = operation()
    const vessel = state.vessels[0]!
    vessel.run = 13
    vessel.operatingRuns = 12
    advanceFacility(state, start + 17 * minute)
    expect(vessel.run).toBe(14)
    expect(vessel.assignment).toBe('standby')
    expect(vessel.cargo).toBe(0)
    advanceFacility(state, start + 43 * minute)
    expect(state.operations.filter((event) => event.operationCode === 112).map((event) => event.summary.match(/extraction run (\d+)/)?.[1])).toEqual(['13', '14'])
    expect(vessel.run).toBe(15)
    expect(vessel.runsSinceService).toBe(1)
  })

  it.each(['remote', 'docked'] as const)('confirms arrival and docking before %s dock repair, retaining its service duration', (location) => {
    const state = operation()
    const vessel = state.vessels[0]!
    if (location === 'docked') vessel.dockingState = 'docked'
    detectFault(state, vessel.id, 'hull-damage', start)
    const job = state.repairJobs[0]!
    expect(job.createdAt).toBe(start)
    expect(job.serviceStartedAt).toBeNull()
    const serviceAt = start + (location === 'docked' ? 1 : 3) * minute
    advanceFacility(state, serviceAt - 1)
    expect(job.serviceStartedAt).toBeNull()
    advanceFacility(state, serviceAt)
    expect(vessel.dockingState).toBe('docked')
    expect(job.serviceStartedAt).toBe(serviceAt)
    expect(job.nextAt).toBe(serviceAt + 10 * minute)
    const reports = state.operations.filter((event) => event.repair?.jobId === job.id)
    expect(reports.map((event) => event.operationCode)).toEqual([235, 240, 125, 140, 230])
    if (location === 'docked') expect(reports.find((event) => event.operationCode === 125)?.summary).toContain('approach already complete')
  })

  it('immediately holds critical power faults and queues recovery when the drone is occupied', () => {
    const state = operation()
    state.repairDrones[0]!.state = 'unavailable'
    const vessel = state.vessels[0]!
    const fault = detectFault(state, vessel.id, 'power-instability', start)!
    expect(fault.decisionAt).toBeNull()
    expect(vessel.assignment).toBe('standby')
    expect(vessel.dockingState).toBe('holding')
    expect(vessel.completesAt).toBeNull()
    expect(state.repairJobs[0]).toMatchObject({ createdAt: start, method: 'remote-drone', state: 'waiting' })
    expect(repairOptions(state, vessel, fault)['1']?.action).toBe('diagnostics')
    expect(decideRepair(state, vessel, fault, 'diagnostics', start)).toContain('Independent safety power is stable')
    advanceFacility(state, start + minute)
    expect(state.repairJobs).toHaveLength(1)
    expect(state.repairJobs[0]?.state).toBe('waiting')
  })

  it('gives critical arrivals first access to a newly cleared berth without interrupting active service', () => {
    const state = operation()
    state.systems.berth = 'isolated'
    state.systems.berthInspectionAt = start + 5 * minute
    const first = state.vessels[0]!
    const ordinary = detectFault(state, first.id, 'cargo-jam', start)!
    decideRepair(state, first, ordinary, 'dock', start)
    const critical = state.vessels[1]!
    detectFault(state, critical.id, 'hull-damage', start)
    advanceFacility(state, start + 5 * minute)
    expect(state.repairJobs.find((job) => job.vesselId === critical.id)?.state).toBe('servicing')
    expect(state.repairJobs.find((job) => job.vesselId === first.id)?.serviceStartedAt).toBeNull()
    advanceFacility(state, start + 15 * minute)
    expect(state.repairJobs.find((job) => job.vesselId === first.id)?.serviceStartedAt).toBe(start + 15 * minute)
  })

  it('starts a new four-run routine-service interval after corrective inspection, including after save import', () => {
    let state = operation()
    let vessel = state.vessels[0]!
    vessel.runsSinceService = 3
    vessel.routineServiceDue = true
    const fault = detectFault(state, vessel.id, 'sensor-degradation', start)!
    decideRepair(state, vessel, fault, 'drone', start)
    const repairedAt = start + 6 * minute + 1000
    advanceFacility(state, repairedAt)
    state = parseSave(exportSave(state, repairedAt), repairedAt)
    vessel = state.vessels[0]!
    expect(vessel.runsSinceService).toBe(0)
    expect(vessel.routineServiceDue).toBe(false)
    advanceFacility(state, repairedAt + 3 * 17 * minute)
    expect(vessel.runsSinceService).toBe(3)
    expect(vessel.assignment).toBe('extraction')
    expect(state.operations.some((event) => event.summary.includes('assigned to routine service'))).toBe(false)
    advanceFacility(state, repairedAt + 4 * 17 * minute)
    expect(vessel.routineServiceDue).toBe(true)
    expect(state.repairDrones[0]?.state).toBe('servicing')
  })

  it('imports older schema 4 service cadence while rejecting malformed new counters', () => {
    const state = operation()
    state.vessels[0]!.operatingRuns = 7
    const envelope = JSON.parse(exportSave(state, start))
    for (const vessel of envelope.state.vessels) delete vessel.runsSinceService
    expect(parseSave(JSON.stringify(envelope), start).vessels[0]!.runsSinceService).toBe(3)
    envelope.state.vessels[0].runsSinceService = -1
    expect(() => parseSave(JSON.stringify(envelope), start)).toThrow()
  })

  it('identifies the returning excavator and idle holding hauler separately in status and reconnect', () => {
    const state = operation()
    advanceFacility(state, start + 15 * minute)
    assertTotals(state)
    const report = returnBriefing(state, start, start + 15 * minute)
    expect(report).toContain('0 mining vessels active. 0 docked. 1 in transit (Excavator Three). 1 holding (Hauler Two).')
    // A stale assignment must not count an approaching vessel as actively mining too.
    state.vessels[0]!.assignment = 'extraction'
    state.vessels[0]!.dockingState = 'approaching'
    assertTotals(state)
    expect(operationalStatus(state)).toContain('0 mining vessels active.')
  })

  it('preserves run, docking, critical-response, service and status invariants through seven unattended days', () => {
    const state = operation()
    let lastOperation = 0
    let previousRun = 0
    const dockSequences = new Map<string, number[]>()
    const faultTypes = new Set<string>()
    let correctiveServices = 0
    for (let elapsed = 1; elapsed <= 7 * 24 * 60; elapsed++) {
      advanceFacility(state, start + elapsed * minute)
      for (const event of state.operations.filter((entry) => Number(entry.id.slice(3)) > lastOperation)) {
        if (event.operationCode === 112) {
          const run = Number(event.summary.match(/extraction run (\d+)/)?.[1])
          expect(run).toBe(previousRun + 1)
          previousRun = run
        }
        const repair = event.repair
        if (!repair?.jobId) continue
        const sequence = dockSequences.get(repair.jobId) ?? []
        if ([235, 240, 125, 140, 230].includes(event.operationCode!)) sequence.push(event.operationCode!)
        dockSequences.set(repair.jobId, sequence)
        if (event.operationCode === 230 && sequence.includes(235)) expect(sequence).toEqual([235, 240, 125, 140, 230])
        if (event.operationCode === 245) {
          correctiveServices++
          faultTypes.add(repair.faultType)
          expect(repair.completedAt! - repair.serviceStartedAt!).toBe(faultLibrary[repair.faultType].serviceMs)
        }
      }
      lastOperation = state.nextOperationId - 1
      for (const vessel of state.vessels) {
        for (const fault of activeFaults(vessel).filter((entry) => entry.severity === 'critical')) {
          expect(fault.decisionAt).toBeNull()
          expect(state.repairJobs.find((job) => job.faultId === fault.id)?.createdAt).toBe(fault.detectedAt)
          expect(vessel.assignment).toBe('standby')
        }
        const justRepaired = state.repairJobs.some((job) => job.vesselId === vessel.id && job.completedAt !== null && job.completedAt > start + (elapsed - 1) * minute)
        if (justRepaired) {
          expect(vessel.routineServiceDue).toBe(false)
          expect(vessel.runsSinceService).toBe(0)
        }
      }
      if (elapsed % 60 === 0) assertTotals(state)
    }
    expect(previousRun).toBeGreaterThan(400)
    expect(correctiveServices).toBeGreaterThan(30)
    expect(faultTypes.size).toBe(8)
    expect(state.productionCycles).toBe(previousRun)
  })
})
