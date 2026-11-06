import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('interrupts a long Easter egg for ordinary operational requests without replaying its remaining lines', async () => {
    let finishOld!: () => void
    native.speakNatively.mockImplementationOnce(() => new Promise<void>((resolve) => { finishOld = resolve })).mockResolvedValue(undefined)
    native.stopNativeSpeech.mockResolvedValue(undefined)
    const audio = new AudioDirector()
    const heard: string[] = []
    audio.speakExchange([
      { speaker: 'Keel', profile: 'measured', text: 'C.A.R.L. Simulator.' },
      { speaker: 'Patch', profile: 'bright', text: 'Unheard reply.' },
    ], (line) => heard.push(line.text))
    expect(native.speakNatively.mock.calls[0]![0].text).toBe('C. A. R. L. Simulator.')
    expect(heard).toEqual(['C.A.R.L. Simulator.'])
    audio.speak('Incoming docking request', 'steady', 3, { kind: 'request', cause: 'dock' })
    await flush()
    finishOld()
    await flush()
    expect(native.stopNativeSpeech).toHaveBeenCalledOnce()
    expect(native.speakNatively.mock.calls.map(([options]) => options.text)).toEqual(['C. A. R. L. Simulator.', 'Incoming docking request'])
    expect(heard).toHaveLength(1)
  })

  it('finishes ordinary speech, then the request, then its immediate decision response', async () => {
    const completions: Array<() => void> = []
    native.speakNatively.mockImplementation(() => new Promise<void>((resolve) => completions.push(resolve)))
    const audio = new AudioDirector()
    audio.speak('Ordinary report', 'terminal', 3)
    audio.speak('Incoming request', 'steady', 3, { kind: 'request', cause: 'docking:1' })
    audio.speak('Decision applied', 'terminal', 2, { kind: 'response', cause: 'docking:1' })
    expect(native.stopNativeSpeech).not.toHaveBeenCalled()
    expect(native.speakNatively).toHaveBeenCalledTimes(1)
    completions[0]!()
    await flush()
    expect(native.speakNatively.mock.calls[1]![0].text).toBe('Incoming request')
    completions[1]!()
    await flush()
    expect(native.speakNatively.mock.calls[2]![0].text).toBe('Decision applied')
  })

  it('replays an interrupted operational request before its response after a genuine safety report', async () => {
    const completions: Array<() => void> = []
    native.speakNatively.mockImplementation(() => new Promise<void>((resolve) => completions.push(resolve)))
    native.stopNativeSpeech.mockResolvedValue(undefined)
    const audio = new AudioDirector()
    audio.speak('Request', 'terminal', 3, { kind: 'request', cause: 'r' })
    audio.speak('Response', 'terminal', 2, { kind: 'response', cause: 'r' })
    audio.speak('Safety', 'terminal', 1)
    await flush()
    completions[1]!()
    await flush()
    expect(native.speakNatively.mock.calls.map(([options]) => options.text)).toEqual(['Request', 'Safety', 'Request'])
    completions[2]!()
    await flush()
    expect(native.speakNatively.mock.calls[3]![0].text).toBe('Response')
  })

  it('hears both crew and Control request lines before an immediate repair decision', async () => {
    const completions: Array<() => void> = []
    native.speakNatively.mockImplementation(() => new Promise<void>((resolve) => completions.push(resolve)))
    const audio = new AudioDirector()
    audio.speak('Ordinary report', 'terminal', 3)
    audio.speak('Crew service request', 'measured', 2, { kind: 'request', cause: 'fault-1' })
    audio.speak('Control presents choices', 'terminal', 2, { kind: 'request', cause: 'fault-1' })
    audio.speak('Drone assigned', 'terminal', 2, { kind: 'response', cause: 'fault-1' })
    for (let i = 0; i < 3; i++) { completions[i]!(); await flush() }
    expect(native.speakNatively.mock.calls.map(([options]) => options.text)).toEqual([
      'Ordinary report', 'Crew service request', 'Control presents choices', 'Drone assigned',
    ])
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

describe('short crew exchanges', () => {
  const lines = [
    { speaker: 'Patch', profile: 'bright', text: 'The excavator is making that noise again.' },
    { speaker: 'Deepwell', profile: 'measured', text: 'That noise is productive confidence.' },
  ]

  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    native.canUseNativeSpeech.mockReturnValue(true)
    native.stopNativeSpeech.mockResolvedValue(undefined)
  })
  afterEach(() => vi.useRealTimers())

  it('plays a reply 600 milliseconds after completion, in order, without unrelated chatter interleaving', async () => {
    let finishFirst!: () => void
    native.speakNatively.mockImplementationOnce(() => new Promise<void>(resolve => { finishFirst = resolve })).mockResolvedValue(undefined)
    const audio = new AudioDirector()
    const onLine = vi.fn()
    expect(audio.speakExchange(lines, onLine)).toBe(true)
    expect(audio.speakExchange([{ speaker: 'Latch', profile: 'steady', text: 'Unrelated.' }], onLine)).toBe(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(native.speakNatively).toHaveBeenCalledTimes(1)
    audio.speak('Queued unrelated chatter', 'steady', 5)
    finishFirst()
    await flush()
    await vi.advanceTimersByTimeAsync(599)
    expect(native.speakNatively).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(native.speakNatively.mock.calls.map(([options]) => options.text)).toEqual([lines[0]!.text, lines[1]!.text, 'Queued unrelated chatter'])
    expect(onLine.mock.calls.map(([line]) => line.speaker)).toEqual(['Patch', 'Deepwell'])
  })

  it('drops the unfinished exchange when a safety report interrupts, with terminal voice parameters unchanged', async () => {
    let finishFirst!: () => void
    native.speakNatively.mockImplementationOnce(() => new Promise<void>(resolve => { finishFirst = resolve })).mockResolvedValue(undefined)
    const audio = new AudioDirector()
    audio.speakExchange(lines, vi.fn())
    audio.speak('Safety report.', 'terminal', 1)
    await flush()
    finishFirst()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(native.speakNatively.mock.calls).toHaveLength(2)
    expect(native.speakNatively.mock.calls[1]![0]).toEqual({ text: 'Safety report.', locale: 'en-GB', rate: 0.92, pitch: 0.86, profileId: 'terminal' })
  })

  it('drops an ambient reply when ordinary operational traffic arrives during the first line', async () => {
    let finish!: () => void
    native.speakNatively.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve })).mockResolvedValue(undefined)
    const audio = new AudioDirector()
    audio.speakExchange(lines, vi.fn())
    audio.speak('Drone dispatched', 'terminal', 2)
    finish()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(native.speakNatively.mock.calls.map(([options]) => options.text)).toEqual([lines[0]!.text, 'Drone dispatched'])
  })

  it('does not play a disconnected reply when the first line fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    native.speakNatively.mockRejectedValueOnce(new Error('Speech unavailable')).mockResolvedValue(undefined)
    const audio = new AudioDirector()
    audio.speakExchange(lines, vi.fn())
    await flush()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(native.speakNatively).toHaveBeenCalledTimes(1)
    warning.mockRestore()
  })

  it('lets a priority report replace the reply during the conversational gap', async () => {
    native.speakNatively.mockResolvedValue(undefined)
    const audio = new AudioDirector()
    audio.speakExchange(lines, vi.fn())
    await flush()
    await vi.advanceTimersByTimeAsync(300)
    audio.speak('Captain request.', 'terminal', 3)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(native.speakNatively.mock.calls.map(([options]) => options.text)).toEqual([lines[0]!.text, 'Captain request.'])
  })

  it('cancels a pending reply on backgrounding or stop and does not revive it later', async () => {
    native.speakNatively.mockResolvedValue(undefined)
    const audio = new AudioDirector()
    audio.speakExchange(lines, vi.fn())
    await flush()
    audio.cancelChatter()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(native.speakNatively).toHaveBeenCalledTimes(1)
    audio.speakExchange(lines, vi.fn())
    await flush()
    audio.stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(native.speakNatively).toHaveBeenCalledTimes(2)
  })
})

describe('conversation and optional-guide playback', () => {
  beforeEach(() => { vi.resetAllMocks(); native.canUseNativeSpeech.mockReturnValue(true); native.stopNativeSpeech.mockResolvedValue(undefined) })
  it('keeps the response paused if the situation fails even when its choices finish', async () => {
    native.speakNatively.mockRejectedValueOnce(new Error('TTS unavailable')).mockResolvedValue(undefined)
    const audio = new AudioDirector()
    const finished = vi.fn()
    audio.speak('Crew situation', 'steady', 2, { kind: 'request', cause: 'fault' }, { onFinish: finished })
    audio.speak('Numbered choices', 'terminal', 2, { kind: 'request', cause: 'fault' }, { onFinish: finished })
    await flush()
    expect(finished).toHaveBeenCalledExactlyOnceWith(true)
  })
  it('starts the response clock only after all numbered request lines finish', async () => {
    const completions: Array<() => void> = []
    native.speakNatively.mockImplementation(() => new Promise<void>(resolve => completions.push(resolve)))
    const audio = new AudioDirector()
    const finished = vi.fn()
    audio.speak('Crew situation', 'steady', 2, { kind: 'request', cause: 'fault' }, { onFinish: finished })
    audio.speak('Numbered choices', 'terminal', 2, { kind: 'request', cause: 'fault' }, { onFinish: finished })
    completions[0]!(); await flush()
    expect(finished).not.toHaveBeenCalled()
    completions[1]!(); await flush()
    expect(finished).toHaveBeenCalledExactlyOnceWith(false)
  })
  it('reports speech failure and never treats a stale cancelled completion as heard', async () => {
    let complete!: () => void
    native.speakNatively.mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve })).mockRejectedValueOnce(new Error('TTS unavailable'))
    const audio = new AudioDirector()
    const finished = vi.fn(), interrupted = vi.fn()
    audio.speak('Choices', 'terminal', 2, { kind: 'request', cause: 'fault' }, { onFinish: finished, onInterrupt: interrupted })
    audio.cancelPrompt('fault'); complete(); await flush()
    expect(interrupted).toHaveBeenCalledOnce()
    expect(finished).not.toHaveBeenCalled()
    audio.speak('Repeat choices', 'terminal', 2, { kind: 'request', cause: 'fault' }, { onFinish: finished })
    await flush()
    expect(finished).toHaveBeenCalledExactlyOnceWith(true)
  })
  it('interrupts the optional guide for operational speech and Stop preserves live radio', async () => {
    const completions: Array<() => void> = []
    native.speakNatively.mockImplementation(() => new Promise<void>(resolve => completions.push(resolve)))
    const audio = new AudioDirector()
    audio.speak('About guide', 'terminal', 6)
    audio.speak('Live docking request', 'steady', 2)
    await flush()
    audio.cancelOptional()
    expect(native.speakNatively.mock.calls.map(([line]) => line.text)).toEqual(['About guide', 'Live docking request'])
    expect(native.stopNativeSpeech).toHaveBeenCalledOnce()
    completions[0]!(); await flush()
    expect(native.speakNatively).toHaveBeenCalledTimes(2)
  })
})
