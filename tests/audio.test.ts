import { beforeEach, describe, expect, it, vi } from 'vitest'
const native = vi.hoisted(() => ({ canUseNativeSpeech: vi.fn(() => true), speakNatively: vi.fn(), stopNativeSpeech: vi.fn() }))
vi.mock('../src/audio/nativeSpeech', () => native)
import { AudioDirector } from '../src/audio/audioDirector'

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

describe('native speech priority', () => {
  beforeEach(() => { vi.resetAllMocks(); native.canUseNativeSpeech.mockReturnValue(true) })

  it('interrupts chatter for safety and ignores completion of the interrupted line', async () => {
    let finishOld!: () => void
    let finishSafety!: () => void
    native.speakNatively
      .mockImplementationOnce(() => new Promise<void>(resolve => { finishOld = resolve }))
      .mockImplementationOnce(() => new Promise<void>(resolve => { finishSafety = resolve }))
      .mockResolvedValue(undefined)
    native.stopNativeSpeech.mockResolvedValue(undefined)
    const audio = new AudioDirector()
    audio.speak('Chatter', 'bright', 5)
    audio.speak('Safety', 'terminal', 1)
    await flush()
    expect(native.stopNativeSpeech).toHaveBeenCalledOnce()
    expect(native.speakNatively.mock.calls[1]![0].text).toBe('Safety')
    audio.speak('Next report', 'terminal', 3)
    finishOld()
    await flush()
    expect(native.speakNatively).toHaveBeenCalledTimes(2)
    finishSafety()
    await flush()
    expect(native.speakNatively.mock.calls[2]![0].text).toBe('Next report')
  })

  it('does not restart queued speech after the terminal is stopped', async () => {
    let finish!: () => void
    native.speakNatively.mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
    native.stopNativeSpeech.mockResolvedValue(undefined)
    const audio = new AudioDirector()
    audio.speak('Current report')
    audio.speak('Queued report')
    audio.stop()
    finish()
    await flush()
    expect(native.speakNatively).toHaveBeenCalledTimes(1)
  })

  it('plays the next report after the speech engine rejects a line', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    native.speakNatively.mockRejectedValueOnce(new Error('Voice unavailable')).mockResolvedValue(undefined)
    const audio = new AudioDirector()
    audio.speak('Unavailable voice')
    audio.speak('Next report')
    await flush()
    expect(native.speakNatively.mock.calls[1]![0].text).toBe('Next report')
    warning.mockRestore()
  })
})
