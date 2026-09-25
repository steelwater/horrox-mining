import { beforeEach, describe, expect, it, vi } from 'vitest'
const storage = vi.hoisted(() => ({ value: null as string | null }))
vi.mock('@capacitor/preferences', () => ({ Preferences: {
  get: vi.fn(async () => ({ value: storage.value })),
  set: vi.fn(async ({ value }: { value: string }) => { storage.value = value }),
  remove: vi.fn(async () => { storage.value = null }),
} }))
import { Preferences } from '@capacitor/preferences'
import { advanceFacility, beginRequest, commissionFacility, createInitialState } from '../src/game/engine'
import { loadFacility, replaceFacility, saveFacility } from '../src/game/persistence'
import { exportSave, formatTranscript, parseSave, SAVE_FORMAT } from '../src/game/portableSave'
import { build, buildLabel } from '../src/game/build'
import metadata from '../package.json'
import { decideRepair, detectFault } from '../src/game/repairs'

const start = 1_800_000_000_000
beforeEach(() => { storage.value = null; vi.restoreAllMocks(); vi.spyOn(Date, 'now').mockReturnValue(start) })

describe('portable save contract', () => {
  it('uses the package version and milestone for exports and transcript headers', () => {
    expect(build).toEqual({ version: metadata.version, milestone: metadata.milestone })
    const state = createInitialState(start)
    const envelope = JSON.parse(exportSave(state, start))
    expect(envelope).toEqual({ format: SAVE_FORMAT, schemaVersion: 4, appVersion: metadata.version, milestone: metadata.milestone, exportedAt: new Date(start).toISOString(), state })
    expect(parseSave(exportSave(state, start), start)).toEqual(state)
    expect(formatTranscript([])).toContain(buildLabel)
  })

  it('copies chronological player-readable timestamps and speakers without internal fields', () => {
    const older = { id: 'private-id', text: 'Request', speaker: 'Latch', timestamp: start, operationAgeMs: 0, priority: 3 as const }
    const newer = { ...older, id: 'new', text: 'Confirmed', speaker: 'Control', timestamp: start + 1_000, operationAgeMs: 1_000 }
    const copied = formatTranscript([newer, older])
    expect(copied).toContain('17 Sept 2075, 00:00:00] Latch: Request')
    expect(copied.indexOf('Request')).toBeLessThan(copied.indexOf('Confirmed'))
    expect(copied).not.toMatch(/private-id|priority|operationAgeMs/)
  })

  it('round trips complete active repairs, pending requests, cargo, crew, preferences and history', async () => {
    const state = createInitialState(start)
    commissionFacility(state, start)
    state.onboardingStatus = 'skipped'
    state.autopilotEnabled = true
    state.vessels[0]!.cargo = 7
    const fault = detectFault(state, 'excavator-03', 'sensor-degradation', start)!
    decideRepair(state, state.vessels[0]!, fault, 'drone', start)
    beginRequest(state, 'maintenance-coolant', start)
    state.transcript.push({ id: 't1', timestamp: start, operationAgeMs: 0, speaker: 'Control', text: 'Service requested', priority: 2 })
    for (const seconds of [0, 1, 121, 361, 481]) {
      advanceFacility(state, start + seconds * 1_000)
      state.lastActiveAt = state.lastProcessedAt
      vi.spyOn(Date, 'now').mockReturnValue(start + seconds * 1_000)
      const parsed = parseSave(exportSave(state, Date.now()), Date.now())
      expect(parsed).toEqual(state)
      await saveFacility(createInitialState(Date.now()))
      expect(await replaceFacility(parsed, Date.now())).toEqual(state)
      expect(await loadFacility()).toEqual(state)
    }
  })

  it('migrates a complete schema 3 envelope using the normal migration path', () => {
    const envelope = JSON.parse(exportSave(createInitialState(start), start))
    envelope.schemaVersion = envelope.state.version = 3
    delete envelope.state.repairJobs; delete envelope.state.nextRepairId
    for (const vessel of envelope.state.vessels) for (const key of ['activeFaults', 'serviceHistory', 'operatingRuns', 'lastFaultRun', 'routineServiceDue', 'resumeAfterRepair']) delete vessel[key]
    for (const drone of envelope.state.repairDrones) for (const key of ['state', 'location', 'assignedJobId', 'transitStartedAt', 'serviceStartedAt', 'maintenanceDue', 'serviceHistory']) delete drone[key]
    expect(parseSave(JSON.stringify(envelope), start)).toEqual(createInitialState(start))
  })

  it.each([
    ['malformed JSON', '{'],
    ['wrong format', JSON.stringify({ format: 'another-game' })],
    ['missing state', JSON.stringify({ format: SAVE_FORMAT, schemaVersion: 4 })],
    ['future schema', JSON.stringify({ format: SAVE_FORMAT, schemaVersion: 5 })],
  ])('rejects %s without modifying storage', async (_name, text) => {
    await saveFacility(createInitialState(start))
    const before = storage.value
    expect(() => parseSave(text, start)).toThrow()
    expect(storage.value).toBe(before)
  })

  it.each(['missing field', 'missing vessel', 'bad condition', 'bad reference', 'invalid nested type', 'duplicate vessel'])('rejects %s rather than silently repairing it', (scenario) => {
    const envelope = JSON.parse(exportSave(createInitialState(start), start))
    if (scenario === 'missing field') delete envelope.state.vessels[0].cargo
    if (scenario === 'missing vessel') envelope.state.vessels.pop()
    if (scenario === 'bad condition') envelope.state.vessels[0].condition = 'imaginary'
    if (scenario === 'bad reference') envelope.state.processingQueue.push({ id: 'q', vesselId: 'missing', tonnes: 1, completesAt: start })
    if (scenario === 'invalid nested type') envelope.state.miners[0].history = [42]
    if (scenario === 'duplicate vessel') envelope.state.vessels[1] = envelope.state.vessels[0]
    expect(() => parseSave(JSON.stringify(envelope), start)).toThrow()
  })

  it('rolls back a failed reinitialization and preserves the exact stored operation', async () => {
    const current = createInitialState(start)
    current.oreProcessed = 42
    await saveFacility(current)
    const previous = storage.value
    vi.mocked(Preferences.get).mockResolvedValueOnce({ value: previous }).mockRejectedValueOnce(new Error('Read failed'))
    await expect(replaceFacility(createInitialState(start), start)).rejects.toThrow('Read failed')
    expect(storage.value).toBe(previous)
  })

  it('rolls back a failed final write and serializes a later save safely', async () => {
    const current = createInitialState(start)
    current.oreProcessed = 42
    await saveFacility(current)
    const previous = storage.value
    vi.mocked(Preferences.set).mockImplementationOnce(async ({ value }) => { storage.value = value }).mockRejectedValueOnce(new Error('Write failed'))
    await expect(replaceFacility(createInitialState(start), start)).rejects.toThrow('Write failed')
    expect(storage.value).toBe(previous)
    await saveFacility(current)
    expect(await loadFacility()).toEqual(current)
  })
})
