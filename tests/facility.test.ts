import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const lifecycle = vi.hoisted(() => ({ mounted: [] as Array<() => void>, unmounted: [] as Array<() => void> }))
const speech = vi.hoisted(() => ({ speak: vi.fn(), speakExchange: vi.fn(), cancelChatter: vi.fn(), startAmbience: vi.fn().mockResolvedValue(undefined), playKeyTone: vi.fn(), stop: vi.fn() }))
vi.mock('../src/audio/audioDirector', () => ({ AudioDirector: class { constructor() { return speech } } }))
vi.mock('../src/game/persistence', () => ({ loadFacility: vi.fn().mockResolvedValue(null), saveFacility: vi.fn().mockResolvedValue(undefined) }))
vi.mock('vue', async (original) => ({ ...await original<typeof import('vue')>(), onMounted: (callback: () => void) => lifecycle.mounted.push(callback), onBeforeUnmount: (callback: () => void) => lifecycle.unmounted.push(callback) }))
import { useFacility } from '../src/composables/useFacility'
import { loadFacility, saveFacility } from '../src/game/persistence'
import { commissionFacility, createInitialState } from '../src/game/engine'
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
})
