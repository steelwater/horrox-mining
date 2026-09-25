import { describe, expect, it } from 'vitest'
import { formatOperationTime, operationAgeAt, operationDate, OPERATION_START } from '../src/game/calendar'
import { advanceFacility, commissionFacility, createInitialState, MAX_CATCHUP_MS } from '../src/game/engine'
import { migrateFacility } from '../src/game/persistence'

const start = Date.UTC(2026, 8, 18)
const day = 86_400_000

describe('Horrox operation calendar', () => {
  it('starts every fresh installation or reset on the canonical commissioning date', () => {
    for (const deviceTime of [start, Date.UTC(2032, 1, 29), Date.UTC(2027, 11, 31, 23)]) {
      const state = createInitialState(deviceTime)
      expect(state.operationStart).toBe(OPERATION_START)
      expect(operationDate(state.facilityAgeMs).toISOString()).toBe('2075-09-17T00:00:00.000Z')
      expect(state.commissioned).toBe(false)
    }
  })

  it('advances at one second per elapsed second and stays independent of device timezone', () => {
    const state = createInitialState(start)
    advanceFacility(state, start + day + 3_600_000)
    expect(operationDate(state.facilityAgeMs).toISOString()).toBe('2075-09-18T01:00:00.000Z')
    expect(formatOperationTime(state.facilityAgeMs)).toContain('01:00:00')
    expect(state.productionCycles).toBe(0)
  })

  it('preserves the calendar and commissioning checkpoint across a save round trip', () => {
    const state = createInitialState(start)
    state.onboardingStatus = 'active'
    state.onboardingStep = 7
    advanceFacility(state, start + 60_000)
    const restored = migrateFacility(JSON.parse(JSON.stringify(state)), start + day)
    expect(restored.operationStart).toBe('2075-09-17')
    expect(restored.facilityAgeMs).toBe(60_000)
    expect(restored.onboardingStep).toBe(7)
    expect(restored.commissioned).toBe(false)
    advanceFacility(restored, start + day)
    expect(operationDate(restored.facilityAgeMs).toISOString()).toBe('2075-09-18T00:00:00.000Z')
  })

  it('migrates schema 2 to the canonical date plus prior age without wiping progress', () => {
    const oldSave = {
      version: 2, createdAt: start - 3 * day, lastProcessedAt: start, lastSavedAt: start,
      facilityAgeMs: 3 * day, oreProcessed: 144, productionCycles: 12,
      onboardingStatus: 'complete', onboardingStep: 7,
      transcript: [{ id: 't1', timestamp: start - day, speaker: 'Facility Control', text: 'Prior report.', priority: 2 }],
      operations: [{ id: 'op-1', timestamp: start - 2 * day, source: 'facility', summary: 'Prior event.', category: 'mining', resolution: 'autonomous' }],
    }
    const migrated = migrateFacility(oldSave, start)
    expect(migrated.commissioned).toBe(true)
    expect(migrated.oreProcessed).toBe(144)
    expect(migrated.productionCycles).toBe(12)
    expect(migrated.onboardingStatus).toBe('complete')
    expect(operationDate(migrated.facilityAgeMs).toISOString()).toBe('2075-09-20T00:00:00.000Z')
    expect(operationDate(migrated.transcript[0]!.operationAgeMs).toISOString()).toBe('2075-09-19T00:00:00.000Z')
    expect(operationDate(migrated.operations[0]!.operationAgeMs).toISOString()).toBe('2075-09-18T00:00:00.000Z')
    expect(migrateFacility(oldSave, start + day).facilityAgeMs).toBe(migrated.facilityAgeMs)
  })

  it('does not pause a completed operation when a commissioning field is missing', () => {
    const state = migrateFacility({ version: 3, lastProcessedAt: start, onboardingStatus: 'complete', facilityAgeMs: day }, start)
    state.nextRepairId = 2 // Established operation: early sensor service already encountered.
    expect(state.commissioned).toBe(true)
    advanceFacility(state, start + 20 * 60_000)
    expect(state.oreProcessed).toBe(12)
    expect(state.operationStart).toBe('2075-09-17')
  })

  it('keeps historical lore timestamps stable after capped catch-up and subsequent reloads', () => {
    const state = createInitialState(start)
    commissionFacility(state, start)
    advanceFacility(state, start + 365 * day)
    expect(state.facilityAgeMs).toBe(365 * day)
    expect(state.operations.every((e) => e.operationAgeMs >= 0 && e.operationAgeMs <= MAX_CATCHUP_MS)).toBe(true)
    const dates = state.operations.map((e) => formatOperationTime(e.operationAgeMs))
    const restored = migrateFacility(JSON.parse(JSON.stringify(state)), start + 365 * day)
    expect(restored.operations.map((e) => formatOperationTime(e.operationAgeMs))).toEqual(dates)
  })
})

describe('calendar beyond the simulation limit', () => {
  it('advances 30 days while producing only seven days of work and retaining log dates', () => {
    const state = createInitialState(start)
    const bounded = createInitialState(start)
    commissionFacility(state, start)
    commissionFacility(bounded, start)
    advanceFacility(state, start + 30 * day)
    advanceFacility(bounded, start + MAX_CATCHUP_MS)
    expect(state.oreProcessed).toBe(bounded.oreProcessed)
    expect(state.productionCycles).toBe(bounded.productionCycles)
    expect(state.operations).toEqual(bounded.operations)
    expect(operationDate(state.facilityAgeMs).toISOString()).toBe('2075-10-17T00:00:00.000Z')
    expect(operationAgeAt(state, start + 30 * day)).toBe(30 * day)
    const restored = migrateFacility(JSON.parse(JSON.stringify(state)), start + 30 * day)
    expect(restored.facilityAgeMs).toBe(30 * day)
    advanceFacility(restored, start + 30 * day)
    expect(restored.productionCycles).toBe(state.productionCycles)
    advanceFacility(restored, start + 31 * day)
    expect(restored.facilityAgeMs).toBe(31 * day)
    expect(restored.operations.at(-1)!.operationAgeMs).toBeGreaterThan(30 * day)
  })

  it('preserves a schema 3 age and transcript dates while adding the full absence', () => {
    const state = migrateFacility({ version: 3, lastProcessedAt: start, facilityAgeMs: 2 * day,
      transcript: [{ id: 't1', timestamp: start, operationAgeMs: day, speaker: 'Facility Control', text: 'Report.', priority: 2 }],
    }, start + 30 * day)
    advanceFacility(state, start + 30 * day)
    expect(state.facilityAgeMs).toBe(32 * day)
    expect(state.transcript[0]!.operationAgeMs).toBe(day)
    expect(state.productionCycles).toBe(0)
  })
})
