import { describe, expect, it } from 'vitest'
import { advanceFacility, commissionFacility, createInitialState, operationalStatus, returnBriefing } from '../src/game/engine'
import { migrateFacility } from '../src/game/persistence'
import { activeFaults, decideRepair, detectFault, detectOperationalWear, escalateFault, faultLibrary, recommendation, repairMenu } from '../src/game/repairs'
import { operationCodes } from '../src/game/operations'
import type { FaultType } from '../src/game/types'

const start = 1_800_000_000_000
const minute = 60_000
function setup(type: FaultType = 'sensor-degradation') {
  const state = createInitialState(start)
  commissionFacility(state, start)
  state.onboardingStatus = 'complete'
  const vessel = state.vessels[0]!
  const fault = detectFault(state, vessel.id, type, start)!
  return { state, vessel, fault }
}

describe('vessel faults and safe decisions', () => {
  it.each(Object.keys(faultLibrary) as FaultType[])('explains and persists %s with subsystem effects', (type) => {
    const { state, vessel, fault } = setup(type)
    expect(vessel.condition).toBe(faultLibrary[type].severity)
    expect(state.operations[0]?.repair).toMatchObject({ faultType: type, subsystem: faultLibrary[type].subsystem, detectedAt: start })
    expect(state.operations[0]?.summary).toContain(faultLibrary[type].name)
    expect(migrateFacility(JSON.parse(JSON.stringify(state)), start)).toEqual(state)
    expect(detectFault(state, vessel.id, type, start)).toBeNull()
    if (!faultLibrary[type].allowsMining) expect(vessel.assignment).toBe('standby')
    else expect(vessel.completesAt).toBeGreaterThan(start + 15 * minute)
    const deadline = fault.decisionAt
    expect(decideRepair(state, vessel, fault, 'diagnostics', start + 1)).toContain(faultLibrary[type].diagnostics)
    expect(fault.decisionAt).toBe(deadline)
  })

  it('allows careful mining but stops at a deterministic service limit', () => {
    const { state, vessel, fault } = setup('drill-wear')
    decideRepair(state, vessel, fault, 'continue', start)
    expect(fault.decisionAt).toBeNull()
    expect(vessel.assignment).toBe('extraction')
    // Keep this run active to exercise the operational wear limit.
    vessel.completesAt = start + 40 * minute
    advanceFacility(state, start + 30 * minute)
    expect(vessel.condition).toBe('fault')
    expect(vessel.assignment).toBe('standby')
    expect(repairMenu(state, vessel, fault)).not.toContain('continue carefully')
  })

  it('waits five minutes then safely resolves a thruster fault without player input', () => {
    const { state, vessel, fault } = setup('thruster-malfunction')
    advanceFacility(state, start + 5 * minute - 1)
    expect(state.repairJobs).toHaveLength(0)
    advanceFacility(state, start + 5 * minute)
    expect(fault.decisionAt).toBeNull()
    expect(state.repairJobs[0]?.state).toBe('dispatched')
    expect(state.operations.some((e) => e.repair?.action === 'drone' && e.resolution === 'autonomous' && e.reason)).toBe(true)
    advanceFacility(state, start + 20 * minute)
    expect(vessel.condition).toBe('nominal')
  })

  it('does not reinterpret late choices or let diagnostics extend a deadline', () => {
    const { state, vessel, fault } = setup('thruster-malfunction')
    decideRepair(state, vessel, fault, 'diagnostics', start + minute)
    decideRepair(state, vessel, fault, 'continue', start + 5 * minute)
    expect(state.repairJobs).toHaveLength(1)
    expect(fault.action).toBe('drone')
  })

  it('persists OFFLINE and resolves 315 only after actual repair', () => {
    const { state, vessel, fault } = setup('thruster-malfunction')
    escalateFault(state, vessel, fault, start, true)
    expect(vessel.condition).toBe('offline')
    expect(repairMenu(state, vessel, fault)).toContain('3 1 5. Vessel disabled')
    expect(repairMenu(state, vessel, fault)).not.toContain('Press 4')
    expect(migrateFacility(JSON.parse(JSON.stringify(state)), start).vessels[0]?.condition).toBe('offline')
    decideRepair(state, vessel, fault, 'crew', start)
    expect(state.operations.some((e) => e.operationCode === 390)).toBe(false)
    advanceFacility(state, start + 11 * minute)
    expect(vessel.condition).toBe('nominal')
    expect(state.operations.find((e) => e.operationCode === 390)?.repair?.outcome).toBe('restored')
  })
})

describe('repair resources and lifecycle', () => {
  it('reserves a remote drone through dispatch, transit, service and return', () => {
    const { state, vessel, fault } = setup()
    decideRepair(state, vessel, fault, 'drone', start)
    const drone = state.repairDrones[0]!
    expect(drone.state).toBe('dispatched')
    advanceFacility(state, start + 1_000)
    expect(drone.state).toBe('in-transit')
    advanceFacility(state, start + 2 * minute + 1_000)
    expect(drone.state).toBe('servicing')
    advanceFacility(state, start + 6 * minute + 1_000)
    expect(vessel.condition).toBe('nominal')
    expect(drone.state).toBe('returning')
    expect(drone.targetId).toBe(vessel.id)
    expect(state.repairJobs[0]?.outcome).toBe('restored')
    advanceFacility(state, start + 8 * minute + 1_000)
    expect(drone.state).toBe('available')
    expect(drone.targetId).toBeNull()
    expect(drone.serviceHistory).toHaveLength(1)
    expect(state.operations.filter((e) => e.operationCode).map((e) => e.operationCode)).toEqual(expect.arrayContaining([205, 215, 220, 225, 230, 245]))
  })

  it('returns to an isolated berth safely, waits, docks and repairs', () => {
    const { state, vessel, fault } = setup('hull-damage')
    state.systems.berth = 'isolated'
    state.systems.berthInspectionAt = start + 8 * minute
    expect(recommendation(state, vessel, fault).text).toContain('isolated')
    decideRepair(state, vessel, fault, 'safe-return', start)
    advanceFacility(state, start + 3 * minute)
    expect(vessel.dockingState).toBe('holding')
    expect(state.repairJobs[0]?.serviceStartedAt).toBeNull()
    advanceFacility(state, start + 8 * minute)
    expect(vessel.dockingState).toBe('docked')
    expect(state.repairJobs[0]?.state).toBe('servicing')
    advanceFacility(state, start + 18 * minute)
    expect(vessel.condition).toBe('nominal')
    expect(state.operations.map((e) => e.operationCode)).toEqual(expect.arrayContaining([325, 125, 140, 230, 245, 390]))
  })

  it('offers a dock fallback and never reuses an assigned drone for another vessel', () => {
    const { state, vessel, fault } = setup()
    decideRepair(state, vessel, fault, 'drone', start)
    const second = state.vessels[1]!
    const secondFault = detectFault(state, second.id, 'thruster-malfunction', start)!
    expect(recommendation(state, second, secondFault).action).toBe('dock')
    expect(recommendation(state, second, secondFault).text).toContain('No repair drone is available')
    decideRepair(state, second, secondFault, 'drone', start)
    expect(state.repairJobs[1]?.state).toBe('waiting')
    advanceFacility(state, start + 6 * minute + 1_000)
    expect(state.repairJobs[1]?.state).toBe('waiting')
    advanceFacility(state, start + 8 * minute + 1_000)
    expect(state.repairJobs[1]?.state).toBe('dispatched')
  })

  it('queues disabled recovery with an unavailable drone without inventing mobility', () => {
    const { state, vessel, fault } = setup('power-instability')
    state.repairDrones[0]!.state = 'unavailable'
    decideRepair(state, vessel, fault, 'crew', start)
    advanceFacility(state, start + 60 * minute)
    expect(vessel.dockingState).toBe('holding')
    expect(state.repairJobs[0]?.state).toBe('waiting')
    state.repairDrones[0]!.state = 'available'
    advanceFacility(state, start + 80 * minute)
    expect(vessel.condition).toBe('nominal')
  })

  it('repairs simultaneous faults without prematurely declaring an emergency resolved', () => {
    const { state, vessel, fault } = setup('power-instability')
    const hull = detectFault(state, vessel.id, 'hull-damage', start)!
    decideRepair(state, vessel, fault, 'drone', start)
    decideRepair(state, vessel, hull, 'crew', start)
    advanceFacility(state, start + 10 * minute)
    expect(state.operations.some((e) => e.operationCode === 390)).toBe(false)
    expect(activeFaults(vessel)).toHaveLength(1)
    advanceFacility(state, start + 35 * minute)
    expect(vessel.condition).toBe('nominal')
    expect(state.operations.filter((e) => e.operationCode === 390)).toHaveLength(1)
  })

  it('services the drone before allowing reuse when maintenance is due', () => {
    const { state, vessel, fault } = setup()
    state.repairDrones[0]!.serviceHistory = ['old-1', 'old-2', 'old-3']
    decideRepair(state, vessel, fault, 'drone', start)
    advanceFacility(state, start + 8 * minute + 1_000)
    expect(state.repairDrones[0]?.state).toBe('maintenance')
    advanceFacility(state, start + 11 * minute + 1_000)
    expect(state.repairDrones[0]?.state).toBe('available')
  })
})

describe('repair persistence and time away', () => {
  it('matches continuous operation across reload at every repair phase', () => {
    const { state, vessel, fault } = setup()
    decideRepair(state, vessel, fault, 'drone', start)
    const offline = JSON.parse(JSON.stringify(state))
    let online = state
    for (const seconds of [1, 30, 121, 180, 361, 400, 481, 600]) {
      advanceFacility(online, start + seconds * 1_000)
      const restored = migrateFacility(JSON.parse(JSON.stringify(online)), start + seconds * 1_000)
      expect(restored).toEqual(online)
      online = restored
    }
    advanceFacility(offline, start + 600_000)
    expect(online).toEqual(offline)
    const snapshot = JSON.stringify(online)
    advanceFacility(online, start + 600_000)
    expect(JSON.stringify(online)).toBe(snapshot)
    expect(returnBriefing(online, start, start + 600_000)).toContain('repaired by Repair Drone One')
    expect(returnBriefing(online, start, start + 600_000)).not.toContain('Arrival in two minutes')
    expect(operationalStatus(online)).not.toContain('Sensor degradation')
  })

  it('repairs malformed drone deadlines without a stale clock event', () => {
    const { state, vessel, fault } = setup()
    decideRepair(state, vessel, fault, 'drone', start)
    const raw = JSON.parse(JSON.stringify(state))
    raw.repairDrones[0].completesAt = start
    const restored = migrateFacility(raw, start)
    expect(restored.repairDrones[0]?.completesAt).toBeNull()
    advanceFacility(restored, start + 10 * minute)
    expect(restored.vessels[0]?.condition).toBe('nominal')
  })

  it('keeps old save progress and routine service while introducing fault defaults', () => {
    const state = createInitialState(start)
    const old = JSON.parse(JSON.stringify(state))
    old.version = 3
    old.vessels[0].condition = 'service-required'
    delete old.repairJobs
    delete old.nextRepairId
    delete old.vessels[0].activeFaults
    const migrated = migrateFacility(old, start)
    expect(migrated.vessels[0]?.routineServiceDue).toBe(true)
    expect(migrated.vessels[0]?.activeFaults).toEqual([])
    expect(migrated.repairJobs).toEqual([])
  })

  it('generates faults only from restrained, deterministic operating contexts', () => {
    const types: FaultType[] = ['drill-wear', 'thruster-malfunction', 'sensor-degradation', 'hull-damage', 'communications-failure', 'cargo-jam', 'power-instability', 'navigation-fault']
    for (const [index, type] of types.entries()) {
      const state = createInitialState(start)
      commissionFacility(state, start)
      const vessel = state.vessels[0]!
      vessel.operatingRuns = (index + 1) * 12
      detectOperationalWear(state, vessel, 'extraction', start)
      detectOperationalWear(state, vessel, 'delivery', start)
      expect(activeFaults(vessel)[0]?.type).toBe(type)
      activeFaults(vessel)[0]!.resolvedAt = start
      detectOperationalWear(state, vessel, 'delivery', start)
      expect(activeFaults(vessel)).toHaveLength(0)
    }
  })

  it('keeps all stable codes paired with understandable meanings', () => {
    for (const code of [201, 205, 210, 215, 220, 225, 230, 235, 240, 245, 250, 290, 301, 302, 303, 304, 305, 306, 310, 315, 320, 325, 330, 340, 350, 390]) expect(operationCodes[code]).toBeTruthy()
  })
})
