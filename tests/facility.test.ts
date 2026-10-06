import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const lifecycle = vi.hoisted(() => ({ mounted: [] as Array<() => void>, unmounted: [] as Array<() => void> }))
const speech = vi.hoisted(() => ({ speak: vi.fn(), speakExchange: vi.fn(), cancelChatter: vi.fn(), startAmbience: vi.fn().mockResolvedValue(undefined), playKeyTone: vi.fn(), stop: vi.fn() }))
vi.mock('../src/audio/audioDirector', () => ({ AudioDirector: class { constructor() { return speech } } }))
vi.mock('../src/game/persistence', async (original) => ({ ...await original<typeof import('../src/game/persistence')>(), loadFacility: vi.fn().mockResolvedValue(null), saveFacility: vi.fn().mockResolvedValue(undefined), replaceFacility: vi.fn() }))
vi.mock('vue', async (original) => ({ ...await original<typeof import('vue')>(), onMounted: (callback: () => void) => lifecycle.mounted.push(callback), onBeforeUnmount: (callback: () => void) => lifecycle.unmounted.push(callback) }))
import { useFacility } from '../src/composables/useFacility'
import { loadFacility, saveFacility, replaceFacility } from '../src/game/persistence'
import { commissionFacility, createInitialState, operationalStatus, returnBriefing } from '../src/game/engine'
import { detectFault } from '../src/game/repairs'
import { exportSave } from '../src/game/portableSave'
import { onboardingSteps } from '../src/game/onboarding'

describe('spoken terminal commands', () => {
  beforeEach(() => { vi.clearAllMocks(); lifecycle.mounted = []; lifecycle.unmounted = [] })
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  it('offers both high-contrast modes and restores the visible terminal from black screen without changing the operation', () => {
    const facility = useFacility()
    const before = JSON.stringify(facility.state)
    expect(facility.displayMode.value).toBe('standard')
    for (const mode of ['high-contrast-white', 'high-contrast-dark', 'dim', 'black']) {
      facility.cycleDisplayMode()
      expect(facility.displayMode.value).toBe(mode)
    }
    facility.restoreDisplay()
    expect(facility.displayMode.value).toBe('standard')
    expect(JSON.stringify(facility.state)).toBe(before)
    expect(saveFacility).not.toHaveBeenCalled()
    expect(speech.speak).not.toHaveBeenCalled()
  })

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

  it('offers chatter only after quiet time and preserves its cooldown beyond the visible transcript', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const callbacks = new Map<number, () => void>()
    vi.stubGlobal('window', { setInterval: (callback: () => void, ms: number) => { callbacks.set(ms, callback) } })
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    speech.speakExchange.mockImplementation((lines, onLine) => { onLine(lines[0]); return true })
    const facility = useFacility()
    await facility.initialize()
    facility.skipOnboarding()
    const opportunity = callbacks.get(90_000)!
    opportunity()
    expect(speech.speakExchange).not.toHaveBeenCalled()
    vi.setSystemTime(Date.now() + 90_000)
    opportunity()
    const first = speech.speakExchange.mock.calls.at(-1)![0]
    expect(facility.state.operations.at(-1)?.category).toBe('chatter')
    facility.state.transcript = []
    opportunity()
    expect(speech.speakExchange.mock.calls.filter(([lines]) => lines === first)).toHaveLength(1)
    random.mockRestore()
  })

  it('announces the assigned crew request before Control confirmation and the applied captain decision', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const callbacks = new Map<number, () => void>()
    vi.stubGlobal('window', { setInterval: (callback: () => void, ms: number) => { callbacks.set(ms, callback) } })
    const facility = useFacility()
    await facility.initialize()
    facility.skipOnboarding()
    speech.speak.mockClear()
    vi.setSystemTime(Date.now() + 120_000)
    callbacks.get(1_000)!()
    expect(speech.speak.mock.calls[0]![0]).toContain('Deepwell requesting service')
    expect(speech.speak.mock.calls[0]![1]).toBe('measured')
    expect(speech.speak.mock.calls[1]![0]).toContain('Service request received from Deepwell')
    expect(speech.speak.mock.calls[1]![0]).toContain('press 3 for vessel support')
    const cause = speech.speak.mock.calls[0]![3].cause
    expect(speech.speak.mock.calls[1]![3]).toEqual({ kind: 'request', cause })
    await facility.pressKey('3')
    await facility.pressKey('2')
    expect(facility.state.repairDrones[0]?.state).toBe('dispatched')
    expect(speech.speak.mock.calls.at(-1)![0]).toContain('Repair Drone One assigned')
    expect(speech.speak.mock.calls.at(-1)![3]).toEqual({ kind: 'response', cause })
  })

  it.each(['reload', 'visibility'] as const)('preserves repair chronology during %s catch-up without replaying expired choices', async (mode) => {
    vi.useFakeTimers()
    const start = 1_800_000_000_000
    vi.setSystemTime(start)
    const callbacks = new Map<number, () => void>()
    const listeners: Record<string, () => void> = {}
    const doc = { hidden: false, addEventListener: (name: string, callback: () => void) => { listeners[name] = callback } }
    vi.stubGlobal('document', doc)
    vi.stubGlobal('window', { setInterval: (callback: () => void, ms: number) => callbacks.set(ms, callback), addEventListener: vi.fn() })
    const saved = createInitialState(start)
    commissionFacility(saved, start)
    saved.onboardingStatus = 'complete'
    if (mode === 'reload') {
      vi.mocked(loadFacility).mockResolvedValueOnce(saved)
      vi.setSystemTime(start + 20 * 60_000)
    }
    const facility = useFacility()
    lifecycle.mounted[0]!()
    await facility.initialize()
    if (mode !== 'reload') {
      facility.skipOnboarding()
      speech.speak.mockClear()
      if (mode === 'visibility') { doc.hidden = true; listeners.visibilitychange!() }
      vi.setSystemTime(start + 20 * 60_000)
      if (mode === 'visibility') { doc.hidden = false; listeners.visibilitychange!() }
      else callbacks.get(1_000)!()
    }
    const events = facility.state.operations.filter((event) => event.repair)
    expect(new Set(events.map((event) => event.timestamp)).size).toBeGreaterThan(4)
    for (const event of events) {
      const report = facility.state.transcript.find((entry) => entry.id === `absence-${event.id}`)!
      expect(report).toBeDefined()
      expect(report.timestamp).toBe(event.timestamp)
      expect(report.operationAgeMs).toBe(event.operationAgeMs)
      expect(report.text).not.toContain('Press 3')
    }
    expect(facility.state.transcript.some((entry) => entry.text.includes('resolved the request autonomously while Captain unavailable'))).toBe(true)
    expect(speech.speak).toHaveBeenCalledTimes(1)
    expect(speech.speak.mock.calls[0]![0]).toContain('after their response windows elapsed')
    expect(speech.speak.mock.calls[0]![0]).not.toContain('press 3 for vessel support')
    const before = JSON.stringify(facility.state.transcript)
    callbacks.get(1_000)!()
    expect(JSON.stringify(facility.state.transcript)).toBe(before)
  })

  it.each(['connected', 'delayed timer', 'hidden'] as const)('describes a timeout correctly after reconnecting before expiry (%s)', async (mode) => {
    vi.useFakeTimers()
    const start = 1_800_000_000_000
    vi.setSystemTime(start)
    const callbacks = new Map<number, () => void>()
    const listeners: Record<string, () => void> = {}
    const doc = { hidden: false, addEventListener: (name: string, callback: () => void) => { listeners[name] = callback } }
    vi.stubGlobal('document', doc)
    vi.stubGlobal('window', { setInterval: (callback: () => void, ms: number) => callbacks.set(ms, callback), addEventListener: vi.fn() })
    const facility = useFacility()
    lifecycle.mounted[0]!()
    await facility.initialize()
    facility.skipOnboarding()
    doc.hidden = true; listeners.visibilitychange!()
    vi.setSystemTime(start + 6 * 60_000)
    doc.hidden = false; listeners.visibilitychange!()
    const deadline = facility.state.vessels[0]!.activeFaults[0]!.decisionAt
    expect(deadline).toBe(start + 7 * 60_000)
    const briefing = speech.speak.mock.calls.at(-1)![0]
    expect(briefing).toContain('1 service request awaiting your decision')
    expect(briefing).toContain('Press 3 for vessel support')
    expect(briefing).not.toContain('Press 2 for')
    expect(briefing).not.toContain('Processor One')
    const firstNewTranscript = facility.state.transcript.length
    speech.speak.mockClear()
    if (mode === 'hidden') { doc.hidden = true; listeners.visibilitychange!() }
    if (mode === 'connected') {
      for (let seconds = 361; seconds <= 18 * 60; seconds++) {
        vi.setSystemTime(start + seconds * 1000); callbacks.get(1000)!()
      }
    } else {
      vi.setSystemTime(start + 18 * 60_000); callbacks.get(1000)!()
      if (mode === 'hidden') {
        expect(speech.speak).not.toHaveBeenCalled()
        doc.hidden = false; listeners.visibilitychange!()
      }
    }
    const fresh = facility.state.transcript.slice(firstNewTranscript).map((entry) => entry.text).join(' ')
    if (mode === 'hidden') expect(fresh).toContain('resolved the request autonomously while Captain unavailable')
    else {
      expect(fresh).toContain('No captain decision was received within the response window')
      expect(fresh).not.toMatch(/During your absence|Captain unavailable|Captain terminal connected/)
      expect(speech.speak.mock.calls.map(([text]) => text).join(' ')).not.toMatch(/absence|unavailable/)
    }
    expect(facility.state.repairJobs[0]?.state).toBe('complete')
    const completion = facility.state.operations.find((entry) => entry.operationCode === 245 && entry.repair)!
    expect(facility.state.transcript.find((entry) => entry.text.includes(completion.summary))?.timestamp).toBe(completion.timestamp)
    const decision = facility.state.operations.find((entry) => entry.reason?.includes('response window elapsed'))!
    expect(decision.timestamp).toBe(deadline)
    expect(decision.resolution).toBe('autonomous')
    expect(decision.reason).not.toContain('unavailable')
  })

  it('keeps short unchanged visibility cycles quiet but reports a new fault', async () => {
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
    const cycle = (ms: number) => {
      doc.hidden = true; listeners.visibilitychange!()
      vi.setSystemTime(Date.now() + ms)
      doc.hidden = false; listeners.visibilitychange!()
    }
    cycle(1_000)
    speech.speak.mockClear()
    cycle(1_000)
    cycle(1_000)
    expect(speech.speak).not.toHaveBeenCalled()
    cycle(120_000)
    expect(speech.speak.mock.calls.at(-1)![0]).toContain('sensor degradation')
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
    expect(facility.state.transcript.some((entry) => entry.text.includes('Facility control has assigned manual sampling'))).toBe(true)
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

  it('keeps saved readiness dormant until the explicit readiness control resumes it', async () => {
    vi.stubGlobal('window', { setInterval: vi.fn() })
    const saved = createInitialState(Date.now())
    saved.onboardingStatus = 'active'
    saved.onboardingStep = 9
    vi.mocked(loadFacility).mockResolvedValueOnce(saved)
    const facility = useFacility()
    await facility.initialize()
    expect(facility.onboardingActive.value).toBe(false)
    expect(speech.speak.mock.calls.flat().join(' ')).not.toContain('Press 9 to enable autopilot.')
    await facility.pressKey('0')
    expect(speech.speak.mock.calls.at(-1)![0]).toContain('Facility not commissioned')
    expect(facility.state.onboardingStep).toBe(9)
    facility.replayOnboarding()
    expect(facility.onboardingActive.value).toBe(true)
    expect(speech.speak.mock.calls.at(-1)![0]).toContain('Press 9 to enable autopilot.')
  })

  it('does not repeat readiness on timer ticks and identifies an explicit repeat', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const callbacks = new Map<number, () => void>()
    vi.stubGlobal('window', { setInterval: (callback: () => void, ms: number) => callbacks.set(ms, callback) })
    const facility = useFacility()
    await facility.initialize()
    facility.replayOnboarding()
    facility.state.onboardingStep = 9
    await facility.pressKey('9')
    const original = speech.speak.mock.calls.at(-1)![0]
    speech.speak.mockClear()
    vi.setSystemTime(Date.now() + 3_000)
    callbacks.get(1000)!()
    expect(speech.speak).not.toHaveBeenCalled()
    await facility.pressKey('0')
    expect(speech.speak.mock.calls[0]![0]).toBe(`Captain requested repeat. ${original}`)
    expect(facility.state.transcript.at(-2)?.text).toBe(`Captain requested repeat. ${original}`)
  })

  it('enables real autopilot when the tutorial announces it', async () => {
    const facility = useFacility()
    facility.ready.value = true
    facility.state.onboardingStatus = 'active'
    facility.replayOnboarding()
    facility.state.onboardingStep = 9
    await facility.pressKey('9')
    expect(facility.state.autopilotEnabled).toBe(true)
    expect(facility.state.onboardingStep).toBe(10)
    const prompt = speech.speak.mock.calls.at(-1)![0]
    await facility.pressKey('0')
    expect(speech.speak.mock.calls.at(-2)![0]).toBe(`Captain requested repeat. ${prompt}`)
    expect(facility.state.onboardingStep).toBe(11)
  })

  it('commissions through the full ordered sequence and does not restart work on readiness replay', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    vi.stubGlobal('window', { setInterval: vi.fn() })
    const facility = useFacility()
    await facility.initialize()
    expect(facility.state.commissioned).toBe(false)
    expect(facility.onboardingActive.value).toBe(false)
    expect(speech.speak.mock.calls.at(-1)![0]).toContain('Facility not commissioned')
    facility.replayOnboarding()
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

  it('leaves readiness dormant after backgrounding and importing a partial check', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_800_000_000_000)
    const listeners: Record<string, () => void> = {}
    const doc = { hidden: false, addEventListener: (name: string, callback: () => void) => { listeners[name] = callback } }
    vi.stubGlobal('document', doc)
    vi.stubGlobal('window', { setInterval: vi.fn(), addEventListener: vi.fn() })
    const facility = useFacility()
    lifecycle.mounted[0]!()
    await facility.initialize()
    facility.replayOnboarding()
    await facility.pressKey('#')
    expect(facility.state.onboardingStep).toBe(1)
    speech.speak.mockClear()
    doc.hidden = true; listeners.visibilitychange!()
    doc.hidden = false; listeners.visibilitychange!()
    expect(facility.onboardingActive.value).toBe(false)
    expect(speech.speak.mock.calls.at(-1)![0]).toContain('Facility not commissioned')
    facility.replayOnboarding()
    expect(facility.state.onboardingStep).toBe(1)
    const imported = createInitialState(Date.now())
    imported.onboardingStatus = 'active'; imported.onboardingStep = 7
    vi.mocked(replaceFacility).mockImplementationOnce(async (value) => value)
    speech.speak.mockClear()
    await facility.importSnapshot(exportSave(imported))
    expect(facility.onboardingActive.value).toBe(false)
    expect(facility.state.onboardingStep).toBe(7)
    expect(speech.speak).not.toHaveBeenCalled()
    await facility.pressKey('0')
    expect(speech.speak.mock.calls.at(-1)![0]).toContain('Facility not commissioned')
    facility.replayOnboarding()
    expect(speech.speak.mock.calls.at(-1)![0]).toContain('Press 8 to acknowledge facility support')
  })

  it('retains simultaneous delivery and routine service in the transcript with one combined announcement', async () => {
    vi.useFakeTimers()
    const start = 1_800_000_000_000
    vi.setSystemTime(start)
    const callbacks = new Map<number, () => void>()
    vi.stubGlobal('window', { setInterval: (callback: () => void, ms: number) => callbacks.set(ms, callback) })
    const facility = useFacility()
    await facility.initialize()
    facility.skipOnboarding()
    facility.state.nextRepairId = 2
    facility.state.vessels[0]!.run = 4
    vi.setSystemTime(start + 15 * 60_000); callbacks.get(1000)!()
    speech.speak.mockClear()
    vi.setSystemTime(start + 17 * 60_000); callbacks.get(1000)!()
    const reports = facility.state.operations.filter((event) => event.timestamp === Date.now())
    expect(reports).toHaveLength(2)
    for (const event of reports) expect(facility.state.transcript).toContainEqual(expect.objectContaining({ text: event.summary, timestamp: event.timestamp }))
    expect(speech.speak).toHaveBeenCalledTimes(1)
    expect(speech.speak.mock.calls[0]![0]).toContain('delivered 12 tonnes')
    expect(speech.speak.mock.calls[0]![0]).toContain('assigned to routine service')
  })

  it('reports remote work resumption in both history and the connected transcript without inventing a return', async () => {
    vi.useFakeTimers()
    const start = 1_800_000_000_000
    vi.setSystemTime(start)
    const callbacks = new Map<number, () => void>()
    vi.stubGlobal('window', { setInterval: (callback: () => void, ms: number) => callbacks.set(ms, callback) })
    const facility = useFacility()
    await facility.initialize(); facility.skipOnboarding()
    vi.setSystemTime(start + 18 * 60_000); callbacks.get(1000)!()
    const resume = facility.state.operations.find((event) => event.summary.includes('extraction resumed at the remote work site'))!
    expect(resume).toBeDefined()
    expect(facility.state.transcript).toContainEqual(expect.objectContaining({ text: resume.summary, timestamp: resume.timestamp }))
    expect(facility.state.operations.some((event) => event.summary.includes('returned safely'))).toBe(false)
    expect(facility.state.vessels[0]?.dockingState).toBe('deployed')
  })

  it.each(['complete', 'delegate'] as const)('explains hours of uncommissioned inactivity, then starts work when checks %s', async (finish) => {
    vi.useFakeTimers()
    const start = 1_800_000_000_000
    vi.setSystemTime(start)
    const callbacks = new Map<number, () => void>()
    vi.stubGlobal('window', { setInterval: (callback: () => void, ms: number) => callbacks.set(ms, callback) })
    const facility = useFacility()
    await facility.initialize()
    expect(speech.speak.mock.calls.at(-1)![0]).toContain('Select Readiness Check')
    vi.setSystemTime(start + 192 * 3_600_000)
    callbacks.get(1000)!(); callbacks.get(90_000)!()
    expect(facility.state.commissioned).toBe(false)
    expect(facility.onboardingActive.value).toBe(false)
    expect(facility.state.productionCycles).toBe(0)
    expect(facility.state.oreProcessed).toBe(0)
    expect(facility.state.operations).toEqual([])
    expect(speech.speakExchange).not.toHaveBeenCalled()
    for (const text of [operationalStatus(facility.state), returnBriefing(facility.state, start, Date.now())]) {
      expect(text).toContain('Facility not commissioned')
      expect(text).toContain('Normal operations have not started')
      expect(text).toContain('Readiness Check')
      expect(text).not.toMatch(/No intervention is required|No significant operational changes/)
    }
    // Normal command keys must not fabricate incidents or authorize commissioning.
    for (const key of ['0', '3', '9', '#'] as const) await facility.pressKey(key)
    expect(facility.state.operations).toEqual([])
    expect(facility.onboardingActive.value).toBe(false)
    expect(facility.state.autopilotEnabled).toBe(false)
    facility.replayOnboarding()
    if (finish === 'delegate') facility.skipOnboarding()
    else for (const step of onboardingSteps) await facility.pressKey(step.expectedKey)
    expect(facility.state.commissioned).toBe(true)
    const deadline = facility.state.vessels[0]!.completesAt
    facility.replayOnboarding(); facility.skipOnboarding()
    expect(facility.state.vessels[0]!.completesAt).toBe(deadline)
    vi.setSystemTime(Date.now() + 90_000)
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    speech.speakExchange.mockImplementation((lines, onLine) => { onLine(lines[0]); return true })
    callbacks.get(90_000)!()
    random.mockRestore()
    expect(facility.state.operations.some((event) => event.category === 'chatter')).toBe(true)
    vi.setSystemTime(Date.now() + 54 * 60_000)
    callbacks.get(1000)!()
    expect(facility.state.productionCycles).toBeGreaterThan(0)
    expect(facility.state.oreProcessed).toBeGreaterThan(0)
    expect(facility.state.operations.some((event) => event.category === 'processing')).toBe(true)
    expect(operationalStatus(facility.state)).not.toContain('not commissioned')
  })

  it('continues a commissioned restored save without requiring another readiness check', async () => {
    vi.useFakeTimers()
    const start = 1_800_000_000_000
    const saved = createInitialState(start)
    commissionFacility(saved, start)
    saved.onboardingStatus = 'active'; saved.onboardingStep = 5
    vi.setSystemTime(start + 54 * 60_000)
    vi.stubGlobal('window', { setInterval: vi.fn() })
    vi.mocked(loadFacility).mockResolvedValueOnce(saved)
    const facility = useFacility()
    await facility.initialize()
    expect(facility.state.commissioned).toBe(true)
    expect(facility.onboardingActive.value).toBe(false)
    expect(facility.state.onboardingStep).toBe(5)
    expect(facility.state.oreProcessed).toBeGreaterThan(0)
    expect(facility.state.operations.length).toBeGreaterThan(0)
    expect(speech.speak.mock.calls.flat().join(' ')).not.toContain('Facility not commissioned')
  })

})
