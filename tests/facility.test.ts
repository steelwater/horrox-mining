import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const lifecycle = vi.hoisted(() => ({ mounted: [] as Array<() => void>, unmounted: [] as Array<() => void> }))
const speech = vi.hoisted(() => ({ speak: vi.fn(), speakExchange: vi.fn(), cancelChatter: vi.fn(), startAmbience: vi.fn().mockResolvedValue(undefined), playKeyTone: vi.fn(), stop: vi.fn() }))
vi.mock('../src/audio/audioDirector', () => ({ AudioDirector: class { constructor() { return speech } } }))
vi.mock('../src/game/persistence', async (original) => ({ ...await original<typeof import('../src/game/persistence')>(), loadFacility: vi.fn().mockResolvedValue(null), saveFacility: vi.fn().mockResolvedValue(undefined), replaceFacility: vi.fn() }))
vi.mock('vue', async (original) => ({ ...await original<typeof import('vue')>(), onMounted: (callback: () => void) => lifecycle.mounted.push(callback), onBeforeUnmount: (callback: () => void) => lifecycle.unmounted.push(callback) }))
import { useFacility } from '../src/composables/useFacility'
import { loadFacility, saveFacility, replaceFacility } from '../src/game/persistence'
import { commissionFacility, createInitialState } from '../src/game/engine'
import { detectFault } from '../src/game/repairs'
import { exportSave } from '../src/game/portableSave'
import { onboardingSteps } from '../src/game/onboarding'

describe('spoken terminal commands', () => {
  beforeEach(() => { vi.clearAllMocks(); lifecycle.mounted = []; lifecycle.unmounted = [] })
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  it('ignores keyboard input before the saved facility has loaded', async () => {
    const facility = useFacility()
    await facility.pressKey('1')
    expect(saveFacility).not.toHaveBeenCalled()
    expect(speech.speak).not.toHaveBeenCalled()
    expect(facility.state.history).toEqual([])
  })

  it('applies a decision immediately and tags its speech with the incoming request cause', async () => {
    const facility = useFacility()
    facility.ready.value = true
    facility.state.onboardingStatus = 'complete'
    commissionFacility(facility.state, Date.now())
    await facility.pressKey('4')
    const request = speech.speak.mock.calls.at(-1)![3]
    await facility.pressKey('1')
    expect(facility.state.pendingEvent).toBeNull()
    expect(facility.state.vessels[1]?.dockingState).toBe('approaching')
    expect(request.kind).toBe('request')
    expect(speech.speak.mock.calls.at(-1)![3]).toEqual({ kind: 'response', cause: request.cause })
  })

  it('limits ambient exchanges to 90-second opportunities and a five-minute per-exchange cooldown', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const callbacks = new Map<number, () => void>()
    vi.stubGlobal('window', { setInterval: (callback: () => void, ms: number) => { callbacks.set(ms, callback) } })
    vi.spyOn(Math, 'random').mockReturnValue(0)
    speech.speakExchange.mockReturnValue(true)
    const facility = useFacility()
    await facility.initialize()
    facility.skipOnboarding()
    const chatter = callbacks.get(90_000)!
    chatter()
    const first = speech.speakExchange.mock.calls.at(-1)![0]
    for (let i = 0; i < 10; i++) chatter()
    expect(speech.speakExchange.mock.calls.filter(([lines]) => lines === first)).toHaveLength(1)
    vi.setSystemTime(Date.now() + 300_000)
    chatter()
    expect(speech.speakExchange.mock.calls.filter(([lines]) => lines === first)).toHaveLength(2)
    vi.spyOn(Math, 'random').mockRestore()
  })

  it('keeps active state unchanged after a failed import and releases input for retry', async () => {
    const facility = useFacility()
    facility.ready.value = true
    facility.state.oreProcessed = 42
    const before = JSON.stringify(facility.state)
    vi.mocked(replaceFacility).mockRejectedValueOnce(new Error('Readback failed'))
    await expect(facility.importSnapshot(exportSave(createInitialState(Date.now())))).rejects.toThrow('Readback failed')
    expect(JSON.stringify(facility.state)).toBe(before)
    expect(facility.importing.value).toBe(false)
    expect(speech.stop).not.toHaveBeenCalled()
  })

  it('does not write or stop current audio for invalid pasted data', async () => {
    const facility = useFacility()
    facility.ready.value = true
    const before = JSON.stringify(facility.state)
    await expect(facility.importSnapshot('{')).rejects.toThrow('Malformed JSON')
    expect(JSON.stringify(facility.state)).toBe(before)
    expect(replaceFacility).not.toHaveBeenCalled()
    expect(speech.stop).not.toHaveBeenCalled()
  })

  it('provides current status even when audio resume remains pending', async () => {
    speech.startAmbience.mockReturnValueOnce(new Promise(() => {}))
    const facility = useFacility()
    facility.ready.value = true
    commissionFacility(facility.state, Date.now())
    facility.state.onboardingStatus = 'complete'
    await facility.pressKey('0')
    expect(speech.speak.mock.calls.at(-1)![0]).toContain('1 mining vessel active')
    expect(saveFacility).toHaveBeenCalled()
  })

  it('persists offline decisions before another immediate restart', async () => {
    vi.stubGlobal('window', { setInterval: vi.fn() })
    const saved = createInitialState(Date.now() - 360_000)
    commissionFacility(saved, saved.lastProcessedAt)
    saved.onboardingStatus = 'complete'
    saved.pendingEvent = { eventId: 'problem-sensor-drift', requestedAt: saved.lastProcessedAt }
    vi.mocked(loadFacility).mockResolvedValueOnce(saved)
    const facility = useFacility()
    await facility.initialize()
    expect(facility.state.pendingEvent).toBeNull()
    expect(saveFacility).toHaveBeenCalledWith(expect.objectContaining({ pendingEvent: null }))
    expect(speech.speak.mock.calls[0]![0]).toContain('Facility control has assigned manual sampling')
  })

  it('blocks writes when a saved operation cannot be read', async () => {
    vi.mocked(loadFacility).mockRejectedValueOnce(new Error('Save unavailable'))
    const facility = useFacility()
    await facility.initialize()
    await facility.pressKey('1')
    expect(facility.ready.value).toBe(false)
    expect(facility.storageError.value).toBe('Save unavailable')
    expect(saveFacility).not.toHaveBeenCalled()
  })

  it('catches up once on resume and announces the absence briefing', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const listeners: Record<string, () => void> = {}
    const doc = { hidden: false, addEventListener: (name: string, callback: () => void) => { listeners[name] = callback } }
    vi.stubGlobal('document', doc)
    vi.stubGlobal('window', { setInterval: vi.fn(), addEventListener: vi.fn() })
    const facility = useFacility()
    lifecycle.mounted[0]!()
    await facility.initialize()
    facility.skipOnboarding()
    facility.state.nextRepairId = 2 // Isolate lifecycle catch-up from the first service interaction.
    doc.hidden = true
    listeners.visibilitychange!()
    vi.setSystemTime(Date.now() + 20 * 60_000)
    doc.hidden = false
    listeners.visibilitychange!()
    expect(facility.state.oreProcessed).toBe(12)
    expect(speech.speak.mock.calls.at(-1)![0]).toContain('During your absence')
    listeners.visibilitychange!()
    expect(facility.state.oreProcessed).toBe(12)
  })

  it('does not reinterpret an expired response as an emergency command', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const facility = useFacility()
    facility.ready.value = true
    commissionFacility(facility.state, Date.now())
    facility.state.onboardingStatus = 'complete'
    await facility.pressKey('3')
    vi.setSystemTime(Date.now() + 300_000)
    await facility.pressKey('1')
    expect(facility.state.systems.berth).toBe('open')
    expect(facility.state.operations.at(-1)?.resolution).toBe('autonomous')
  })

  it('speaks the saved tutorial step after reconnecting', async () => {
    vi.stubGlobal('window', { setInterval: vi.fn() })
    const saved = createInitialState(Date.now())
    saved.onboardingStatus = 'active'
    saved.onboardingStep = 9
    vi.mocked(loadFacility).mockResolvedValueOnce(saved)
    const facility = useFacility()
    await facility.initialize()
    expect(speech.speak.mock.calls.at(-1)![0]).toContain('Press 9 to enable autopilot.')
    expect(facility.state.onboardingStep).toBe(9)
  })

  it('enables real autopilot when the tutorial announces it', async () => {
    const facility = useFacility()
    facility.ready.value = true
    facility.state.onboardingStatus = 'active'
    facility.state.onboardingStep = 9
    await facility.pressKey('9')
    expect(facility.state.autopilotEnabled).toBe(true)
    expect(facility.state.onboardingStep).toBe(10)
    const prompt = speech.speak.mock.calls.at(-1)![0]
    await facility.pressKey('0')
    expect(speech.speak.mock.calls.at(-2)![0]).toBe(prompt)
    expect(facility.state.onboardingStep).toBe(11)
  })

  it('commissions through the full ordered sequence and does not restart work on readiness replay', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    vi.stubGlobal('window', { setInterval: vi.fn() })
    const facility = useFacility()
    await facility.initialize()
    expect(facility.state.commissioned).toBe(false)
    for (const step of onboardingSteps) {
      expect(facility.state.productionCycles).toBe(0)
      vi.setSystemTime(Date.now() + 60_000)
      await facility.pressKey(step.expectedKey)
    }
    expect(facility.state.onboardingStatus).toBe('complete')
    expect(facility.state.commissioned).toBe(true)
    expect(facility.state.autopilotEnabled).toBe(true)
    expect(facility.state.vessels[0]?.assignment).toBe('extraction')
    expect(speech.speak.mock.calls.every(([, profile]) => profile === 'terminal')).toBe(true)
    const deadline = facility.state.vessels[0]!.completesAt
    const age = facility.state.facilityAgeMs
    facility.replayOnboarding()
    facility.skipOnboarding()
    expect(facility.state.vessels[0]!.completesAt).toBe(deadline)
    expect(facility.state.facilityAgeMs).toBe(age)
  })

  it('repeats a pending request even after an invalid response without changing its deadline', async () => {
    const facility = useFacility()
    facility.ready.value = true
    commissionFacility(facility.state, Date.now())
    facility.state.onboardingStatus = 'complete'
    await facility.pressKey('4')
    const request = speech.speak.mock.calls.at(-1)![0]
    const pending = { ...facility.state.pendingEvent! }
    await facility.pressKey('8')
    await facility.pressKey('0')
    expect(speech.speak.mock.calls.at(-1)![0]).toBe(request)
    expect(facility.state.pendingEvent).toEqual(pending)
  })
  it('routes vessel support through mining and preserves deadlines across repeat, diagnostics and back', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const facility = useFacility()
    facility.ready.value = true
    commissionFacility(facility.state, Date.now())
    facility.state.onboardingStatus = 'complete'
    const vessel = facility.state.vessels[0]!
    const fault = detectFault(facility.state, vessel.id, 'sensor-degradation', Date.now())!
    const deadline = fault.decisionAt
    await facility.pressKey('3')
    expect(speech.speak.mock.calls.at(-1)![0]).toContain('Press 2 for dispatch repair drone')
    await facility.pressKey('1')
    expect(speech.speak.mock.calls.at(-1)![0]).toContain('2 0 1. Diagnostics requested')
    await facility.pressKey('0')
    expect(speech.speak.mock.calls.at(-1)![0]).toContain('Condition DEGRADED')
    await facility.pressKey('*')
    expect(fault.decisionAt).toBe(deadline)
    await facility.pressKey('3')
    await facility.pressKey('2')
    expect(facility.state.repairDrones[0]?.state).toBe('dispatched')
    await facility.pressKey('0')
    expect(speech.speak.mock.calls.at(-1)![0]).toContain('Drone support dispatched')
    await facility.pressKey('*')
    await facility.pressKey('8')
    expect(speech.speak.mock.calls.at(-1)![0]).toContain('Repair Drone One: dispatched')
  })

  it('opens urgent recovery even during an ordinary pending request, and ignores an expired repair choice', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const facility = useFacility()
    facility.ready.value = true
    commissionFacility(facility.state, Date.now())
    facility.state.onboardingStatus = 'complete'
    await facility.pressKey('4')
    detectFault(facility.state, facility.state.vessels[0]!.id, 'power-instability', Date.now())
    await facility.pressKey('1')
    expect(speech.speak.mock.calls.at(-1)![0]).toContain('Power instability')
    vi.setSystemTime(Date.now() + 300_000)
    await facility.pressKey('1')
    expect(facility.state.repairJobs).toHaveLength(1)
    expect(facility.state.operations.some((e) => e.operationCode === 201)).toBe(false)
    expect(facility.state.systems.berth).toBe('open')
  })

})
