import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ canUseNativeSpeech: vi.fn(() => true), speakNatively: vi.fn(), stopNativeSpeech: vi.fn() }))
vi.mock('../src/audio/nativeSpeech', () => native)
vi.mock('../src/game/persistence', async original => ({ ...await original<typeof import('../src/game/persistence')>(), saveFacility: vi.fn().mockResolvedValue(undefined) }))
vi.mock('vue', async original => ({ ...await original<typeof import('vue')>(), onMounted: vi.fn(), onBeforeUnmount: vi.fn() }))
import { useFacility } from '../src/composables/useFacility'
import { advanceFacility, commissionFacility } from '../src/game/engine'
import { exhibits } from '../src/game/information'

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(1_800_000_000_000); native.canUseNativeSpeech.mockReturnValue(true) })
afterEach(() => vi.useRealTimers())

it('interrupts About for real safety autonomy, preserves choice ordering, and replays only on request', async () => {
  const completions: Array<() => void> = []
  const heard: string[] = []
  let stopped!: () => void
  native.stopNativeSpeech.mockImplementationOnce(() => new Promise<void>(resolve => { stopped = resolve })).mockResolvedValue(undefined)
  native.speakNatively.mockImplementation(({ text }) => {
    heard.push(text)
    return new Promise<void>(resolve => completions.push(resolve))
  })
  const facility = useFacility(); facility.ready.value = true
  commissionFacility(facility.state, Date.now()); facility.state.onboardingStatus = 'complete'
  facility.state.nextRepairId = 2 // Isolate this scenario from the first-run sensor fault.
  const guide = exhibits[0]!.text
  const settings = JSON.parse(JSON.stringify(facility.state.keypadProtection))
  facility.playInformation(guide)
  expect(facility.state.transcript).toHaveLength(0)
  expect(facility.state.operations).toHaveLength(0)
  await facility.pressKey('1') // Established pressure-seal event, immediate safe autonomy; no choices by design.
  expect(native.stopNativeSpeech).toHaveBeenCalledOnce()
  expect(heard).toEqual([guide]) // Urgent playback waits for cancellation to finish.
  expect(facility.state.systems.berth).toBe('isolated')
  expect(facility.state.pendingEvent).toBeNull()
  expect(facility.state.operations.some(e => e.category === 'safety' && e.resolution === 'autonomous')).toBe(true)
  stopped(); await flush()
  expect(heard[1]).toContain('Safety notice')
  completions[0]!(); await flush() // Obsolete About completion cannot resume optional narration.
  completions[1]!(); await flush()
  expect(heard[2]).toContain('Berth Four isolated')
  completions[2]!(); await flush()
  expect(heard).toHaveLength(3)
  await facility.pressKey('5') // Real noncritical request proves the post-emergency choice clock.
  expect(heard[3]).toContain('Press 1 for inspection now')
  expect(facility.conversationStatus.value).toContain('Listening to request')
  completions[3]!(); await flush()
  expect(facility.conversationStatus.value).toContain('15 seconds')
  vi.setSystemTime(Date.now() + 15_000)
  advanceFacility(facility.state, Date.now())
  expect(facility.state.pendingEvent).toBeNull()
  expect(facility.state.systems.coolant).toBe('inspection')
  expect(facility.state.operations.filter(e => e.category === 'maintenance' && e.reason?.includes('response window elapsed'))).toHaveLength(1)
  const transcript = JSON.stringify(facility.state.transcript)
  const operations = JSON.stringify(facility.state.operations)
  facility.playInformation(guide); await flush()
  expect(heard.at(-1)).toBe(guide)
  expect(heard.filter(line => line === guide)).toHaveLength(2)
  expect(JSON.stringify(facility.state.transcript)).toBe(transcript)
  expect(JSON.stringify(facility.state.operations)).toBe(operations)
  expect(transcript + operations).not.toContain('Welcome, Captain.')
  expect(native.speakNatively.mock.calls.at(-1)![0]).toMatchObject({ profileId: 'terminal', locale: 'en-GB', rate: 0.92, pitch: 0.86 })
  expect(facility.state.keypadProtection).toEqual(settings)
})
