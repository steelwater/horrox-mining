import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const speech = vi.hoisted(() => ({ speak: vi.fn(), startAmbience: vi.fn().mockResolvedValue(undefined), playKeyTone: vi.fn(), stop: vi.fn() }))
vi.mock('../src/audio/audioDirector', () => ({ AudioDirector: class { constructor() { return speech } } }))
vi.mock('../src/game/persistence', () => ({ loadFacility: vi.fn().mockResolvedValue(null), saveFacility: vi.fn().mockResolvedValue(undefined) }))
vi.mock('vue', async (original) => ({ ...await original<typeof import('vue')>(), onMounted: vi.fn(), onBeforeUnmount: vi.fn() }))
import { useFacility } from '../src/composables/useFacility'
import { loadFacility, saveFacility } from '../src/game/persistence'
import { createInitialState } from '../src/game/engine'

describe('spoken terminal commands', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('ignores keyboard input before the saved facility has loaded', async () => {
    const facility = useFacility()
    await facility.pressKey('1')
    expect(saveFacility).not.toHaveBeenCalled()
    expect(speech.speak).not.toHaveBeenCalled()
    expect(facility.state.history).toEqual([])
  })

  it('speaks the saved tutorial step after reconnecting', async () => {
    vi.stubGlobal('window', { setInterval: vi.fn() })
    const saved = createInitialState(Date.now())
    saved.onboardingStatus = 'active'
    saved.onboardingStep = 4
    vi.mocked(loadFacility).mockResolvedValueOnce(saved)
    const facility = useFacility()
    await facility.initialize()
    expect(speech.speak.mock.calls.at(-1)![0]).toBe('Press 9 to enable autopilot.')
    expect(facility.state.onboardingStep).toBe(4)
  })

  it('enables real autopilot when the tutorial announces it', async () => {
    const facility = useFacility()
    facility.ready.value = true
    facility.state.onboardingStatus = 'active'
    facility.state.onboardingStep = 4
    await facility.pressKey('9')
    expect(facility.state.autopilotEnabled).toBe(true)
    expect(facility.state.onboardingStep).toBe(5)
    const prompt = speech.speak.mock.calls.at(-1)![0]
    await facility.pressKey('0')
    expect(speech.speak.mock.calls.at(-2)![0]).toBe(prompt)
    expect(facility.state.onboardingStep).toBe(6)
  })

  it('repeats a pending request even after an invalid response without changing its deadline', async () => {
    const facility = useFacility()
    facility.ready.value = true
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
