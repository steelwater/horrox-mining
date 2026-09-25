import { describe, expect, it } from 'vitest'
import { advanceFacility, commissionFacility, createInitialState, restoreState } from '../src/game/engine'
import { migrateFacility } from '../src/game/persistence'
import { decideRepair } from '../src/game/repairs'

const start = 1_800_000_000_000
const minute = 60_000

describe('normal Milestone 3 operation', () => {
  it('surfaces a real fault within two minutes, resolves the unattended decision at five minutes, and starts service within ten', () => {
    const state = createInitialState(start)
    commissionFacility(state, start)
    state.onboardingStatus = 'complete'
    advanceFacility(state, start + 2 * minute)
    const vessel = state.vessels[0]!
    expect(vessel.activeFaults[0]?.type).toBe('sensor-degradation')
    expect(vessel.activeFaults[0]?.decisionAt).toBe(start + 7 * minute)
    expect(state.operations[0]?.operationCode).toBe(205)
    advanceFacility(state, start + 10 * minute)
    expect(state.repairJobs[0]?.state).toBe('servicing')
    expect(state.operations.map((entry) => entry.operationCode)).toEqual(expect.arrayContaining([205, 215, 220, 225, 230]))
    advanceFacility(state, start + 14 * minute)
    expect(state.operations.some((entry) => entry.operationCode === 245)).toBe(true)
    expect(vessel.condition).toBe('nominal')
  })

  it('allows a captain to complete the early sequence within ten minutes', () => {
    const state = createInitialState(start)
    commissionFacility(state, start)
    advanceFacility(state, start + 2 * minute)
    const vessel = state.vessels[0]!
    decideRepair(state, vessel, vessel.activeFaults[0]!, 'drone', start + 2 * minute)
    advanceFacility(state, start + 9 * minute)
    expect(state.repairJobs[0]?.state).toBe('complete')
    expect(vessel.condition).toBe('nominal')
  })

  it('does not replay the early incident on reload or readiness review and keeps subsequent wear conservative', () => {
    const state = createInitialState(start)
    commissionFacility(state, start)
    advanceFacility(state, start + 15 * minute)
    const restored = migrateFacility(state, start + 15 * minute)
    commissionFacility(restored, start + 15 * minute)
    const later = restoreState(restored, start + 120 * minute).state
    expect(later.nextRepairId).toBe(3)
    expect(later.operations.filter((entry) => entry.operationCode === 205)).toHaveLength(1)
  })
})
