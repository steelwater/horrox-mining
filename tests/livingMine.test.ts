import { beforeEach, describe, expect, it, vi } from 'vitest'
import { advanceFacility, applyPendingDecision, beginRequest, CAPTAIN_TIMEOUT_MS, commissionFacility, createInitialState as freshFacility, operationalStatus, restoreState, returnBriefing, safeElapsed } from '../src/game/engine'
import { loadFacility, migrateFacility, saveFacility, SAVE_KEY } from '../src/game/persistence'
import { voiceProfiles } from '../src/game/content'

const storage = vi.hoisted(() => ({ value: null as string | null }))
vi.mock('@capacitor/preferences', () => ({ Preferences: {
  get: vi.fn(async () => ({ value: storage.value })),
  set: vi.fn(async ({ value }: { value: string }) => { storage.value = value }),
} }))

function createInitialState(now: number) {
  const state = freshFacility(now)
  commissionFacility(state, now)
  return state
}

const start = 1_800_000_000_000
const minute = 60_000

beforeEach(() => { storage.value = null })

describe('persistent mine operations', () => {
  it('saves and restores miners, assignments, cargo, queues, drones and history', async () => {
    const state = createInitialState(start)
    state.onboardingStatus = 'complete'
    advanceFacility(state, start + 69 * minute)
    expect(state.repairDrones[0]?.targetId).toBe('excavator-03')
    expect(state.processingQueue.length).toBe(1)
    await saveFacility(state)
    vi.spyOn(Date, 'now').mockReturnValue(start + 69 * minute)
    expect(await loadFacility()).toEqual(state)
    vi.restoreAllMocks()
    expect(SAVE_KEY).toBe('horrox-facility-v1')
  })

  it('advances extraction, delivery and processing only at their deadlines', () => {
    const state = createInitialState(start)
    advanceFacility(state, start + 14 * minute)
    expect(state.vessels[0]?.miningProgress).toBeCloseTo(14 / 15)
    expect(state.productionCycles).toBe(0)
    advanceFacility(state, start + 15 * minute)
    expect(state.vessels[0]?.cargo).toBe(12)
    expect(state.oreProcessed).toBe(0)
    advanceFacility(state, start + 17 * minute)
    expect(state.vessels[0]?.delivered).toBe(12)
    expect(state.processingQueue).toHaveLength(1)
    advanceFacility(state, start + 20 * minute)
    expect(state.oreProcessed).toBe(12)
    expect(state.processingQueue).toHaveLength(0)
    expect(state.operations.every((event) => event.reason && event.resolution === 'autonomous')).toBe(true)
  })

  it('produces the same result online, offline, and across repeated save/restore intervals', () => {
    const offline = createInitialState(start)
    let online = createInitialState(start)
    advanceFacility(offline, start + 120 * minute)
    for (let i = 1; i <= 120; i++) {
      advanceFacility(online, start + i * minute)
      online = migrateFacility(JSON.parse(JSON.stringify(online)), start + i * minute)
    }
    expect(online).toEqual(offline)
    const before = JSON.stringify(offline)
    advanceFacility(offline, start + 120 * minute)
    expect(JSON.stringify(offline)).toBe(before)
  })

  it('completes routine service and returns a vessel to work without player input', () => {
    const state = createInitialState(start)
    advanceFacility(state, start + 73 * minute)
    expect(state.vessels[0]?.condition).toBe('nominal')
    expect(state.repairDrones[0]?.targetId).toBeNull()
    expect(state.operations.some((e) => e.summary.includes('completed routine service'))).toBe(true)
  })

  it('returns an unsafe vessel to dock instead of continuing extraction', () => {
    const state = createInitialState(start)
    state.vessels[0]!.routineServiceDue = true
    advanceFacility(state, start + minute)
    expect(state.vessels[0]?.dockingState).toBe('returning')
    expect(state.productionCycles).toBe(0)
    expect(state.operations[0]?.reason).toContain('unnecessary operational risk')
    advanceFacility(state, start + 7 * minute)
    expect(state.vessels[0]?.condition).toBe('nominal')
  })

  it('limits very long absences without damage, game-over, or replayable catch-up', () => {
    const state = createInitialState(start)
    const now = start + 365 * 24 * 60 * minute
    advanceFacility(state, now)
    expect(state.facilityAgeMs).toBe(now - start)
    expect(state.equipmentWear).toBe(0)
    expect(state.productionCycles).toBeGreaterThan(0)
    expect(state.operations.length).toBeLessThanOrEqual(1000)
    expect(state.lastProcessedAt).toBe(now)
    const saved = JSON.stringify(state)
    advanceFacility(state, now)
    expect(JSON.stringify(state)).toBe(saved)
    expect(returnBriefing(state, start, now)).toContain('limited to seven days')
  })
})

describe('decisions and operational record', () => {
  it('waits five minutes for preference, then lets the responsible miner decide', () => {
    const state = createInitialState(start)
    beginRequest(state, 'mining-vein-choice', start)
    advanceFacility(state, start + CAPTAIN_TIMEOUT_MS - 1)
    expect(state.pendingEvent).not.toBeNull()
    advanceFacility(state, start + CAPTAIN_TIMEOUT_MS)
    expect(state.pendingEvent).toBeNull()
    expect(state.operations.at(-1)).toMatchObject({ timestamp: start + CAPTAIN_TIMEOUT_MS, source: 'sol-arden', resolution: 'autonomous', actionRequested: true })
    expect(state.operations.at(-1)?.reason).toContain('safe procedure')
  })

  it('escalates cross-system issues to facility control, including while offline', () => {
    const state = createInitialState(start)
    beginRequest(state, 'problem-sensor-drift', start)
    const restored = restoreState(state, start + 6 * minute).state
    expect(restored.systems.scanner).toBe('manual-sampling')
    expect(restored.operations.at(-1)).toMatchObject({ source: 'facility', resolution: 'autonomous' })
    expect(restored.operations.at(-1)?.reason).toContain('extraction and processing')
    advanceFacility(restored, start + 10 * minute)
    expect(restored.systems.scanner).toBe('nominal')
  })

  it('records manual decisions and applies docking state changes', () => {
    const state = createInitialState(start)
    beginRequest(state, 'docking-hauler-two', start)
    applyPendingDecision(state, '1', start + minute)
    expect(state.vessels[1]?.dockingState).toBe('approaching')
    expect(state.operations.at(-1)?.resolution).toBe('manual')
    advanceFacility(state, start + 3 * minute)
    expect(state.vessels[1]?.dockingState).toBe('docked')
  })

  it('uses the selected cut duration and yield, including after routine service', () => {
    const state = createInitialState(start)
    beginRequest(state, 'mining-vein-choice', start)
    applyPendingDecision(state, '1', start + minute)
    advanceFacility(state, start + 15 * minute)
    expect(state.productionCycles).toBe(0)
    advanceFacility(state, start + 20 * minute)
    expect(state.vessels[0]?.cargo).toBe(16)
    advanceFacility(state, start + 93 * minute)
    expect(state.vessels[0]?.completesAt).toBe(start + 113 * minute)
  })

  it('does not allow a late key to overrule an expired preference', () => {
    const state = createInitialState(start)
    beginRequest(state, 'mining-vein-choice', start)
    applyPendingDecision(state, '1', start + CAPTAIN_TIMEOUT_MS)
    expect(state.vessels[0]?.cut).toBe('stable')
    expect(state.operations.at(-1)?.resolution).toBe('autonomous')
  })

  it('isolates a berth immediately and prevents unsafe docking', () => {
    const state = createInitialState(start)
    beginRequest(state, 'safety-pressure-seal', start)
    expect(state.pendingEvent).toBeNull()
    expect(state.systems.berth).toBe('isolated')
    beginRequest(state, 'docking-hauler-two', start + 1)
    applyPendingDecision(state, '1', start + 2)
    expect(state.vessels[1]?.dockingState).toBe('holding')
    expect(state.operations.at(-1)?.reason).toContain('cannot be issued safely')
  })

  it('summarizes meaningful work and current attention without inventing activity', () => {
    const state = createInitialState(start)
    expect(returnBriefing(state, start, start + minute)).toContain('No significant operational changes')
    beginRequest(state, 'problem-sensor-drift', start)
    expect(operationalStatus(state)).toContain('One decision pending')
    advanceFacility(state, start + 20 * minute)
    const briefing = returnBriefing(state, start, start + 20 * minute)
    expect(briefing).toContain('Facility control has assigned manual sampling')
    expect(briefing).toContain('No intervention is required')
    expect(operationalStatus(state)).toContain('1 mining vessel active')
    expect(operationalStatus(state)).toContain('1 available')
    expect(state.operations.map((e) => e.timestamp)).toEqual(state.operations.map((e) => e.timestamp).sort((a, b) => a - b))
  })
})

describe('save integrity and established voice', () => {
  it('migrates the original counters, pending request, onboarding and history without retroactive production', () => {
    const state = migrateFacility({ version: 1, createdAt: start, lastSavedAt: start, oreProcessed: 144, history: ['existing history'], onboardingStatus: 'active', onboardingStep: 4, pendingEvent: { eventId: 'docking-hauler-two', requestedAt: start } }, start)
    expect(state.version).toBe(4)
    expect(state.oreProcessed).toBe(144)
    expect(state.history).toEqual(['existing history'])
    expect(state.onboardingStep).toBe(0)
    expect(state.pendingEvent?.requestedAt).toBe(start)
    expect(state.vessels).toHaveLength(2)
  })

  it('safely defaults missing or malformed fields and invalid clocks', () => {
    const state = migrateFacility({ version: 2, lastProcessedAt: Infinity, lastSavedAt: -1, productionCycles: 'invalid', pendingEvent: { eventId: 'missing' }, onboardingStep: 500, vessels: [null], operations: [null], processingQueue: [null] }, start)
    expect(state.lastProcessedAt).toBe(start)
    expect(state.productionCycles).toBe(0)
    expect(state.pendingEvent).toBeNull()
    expect(state.onboardingStep).toBe(0)
    expect(safeElapsed(NaN, start)).toBe(0)
    expect(safeElapsed(start + minute, start)).toBe(0)
    const snapshot = JSON.stringify(state)
    advanceFacility(state, start - minute)
    expect(JSON.stringify(state)).toBe(snapshot)
    advanceFacility(state, NaN)
    expect(JSON.stringify(state)).toBe(snapshot)
  })

  it('does not overwrite malformed or newer saves', async () => {
    storage.value = '{invalid'
    await expect(loadFacility()).rejects.toThrow('has not been replaced')
    expect(storage.value).toBe('{invalid')
    storage.value = JSON.stringify({ version: 99 })
    await expect(loadFacility()).rejects.toThrow('newer version')
  })

  it('preserves the exact established facility voice configuration', () => {
    expect(voiceProfiles.find((profile) => profile.id === 'terminal')).toEqual({ id: 'terminal', locale: 'en', rate: 0.92, pitch: 0.86, preferredNameHints: ['Daniel', 'Alex', 'Samantha'], fallbackOrder: ['en-GB', 'en-US'] })
  })
})
