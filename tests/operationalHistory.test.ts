import { describe, expect, it } from 'vitest'
import { advanceFacility, commissionFacility, createInitialState, restoreState } from '../src/game/engine'
import { formatOperationalHistory, formatTranscript } from '../src/game/portableSave'
import { formatOperationTime } from '../src/game/calendar'
import { buildLabel } from '../src/game/build'

const start = 1_800_000_000_000

describe('operational history export', () => {
  it('includes build metadata and a useful empty state', () => {
    expect(formatOperationalHistory([])).toBe(`1st Horrox Mining Ltd. — ${buildLabel}\n\nOPERATIONAL HISTORY\n\n0 events`)
  })

  it('exports every retained event oldest first, with sources, actors, resolutions and optional reasons, without mutating history', () => {
    const state = createInitialState(start)
    commissionFacility(state, start)
    advanceFacility(state, start + 20 * 60_000)
    const newestFirst = [...state.operations].reverse()
    const before = JSON.stringify(newestFirst)
    const text = formatOperationalHistory(newestFirst)
    expect(text).toContain(`${newestFirst.length} events`)
    let lastPosition = -1
    for (const entry of state.operations) {
      const block = `[${formatOperationTime(entry.operationAgeMs)}]\nSource: ${entry.source}\n${entry.repair && entry.repair.actor !== entry.source ? `Actor: ${entry.repair.actor}\n` : ''}Resolution: ${entry.resolution}\n${entry.summary}${entry.reason ? `\nReason: ${entry.reason}` : ''}`
      const position = text.indexOf(block, lastPosition + 1)
      expect(position).toBeGreaterThan(lastPosition)
      lastPosition = position
    }
    expect(JSON.stringify(newestFirst)).toBe(before)
    const one = { ...state.operations[0]!, reason: null }
    const single = formatOperationalHistory([one])
    expect(single).toContain('1 event\n')
    expect(single).not.toContain('Reason:')
  })

  it('omits duplicate actors while retaining an actor that differs from the source', () => {
    const state = createInitialState(start)
    commissionFacility(state, start)
    advanceFacility(state, start + 3 * 60_000)
    const entry = state.operations.find((event) => event.repair)!
    expect(formatOperationalHistory([entry])).not.toContain('Actor:')
    const distinct = { ...entry, repair: { ...entry.repair!, actor: 'captain' } }
    expect(formatOperationalHistory([distinct])).toContain(`Source: ${entry.source}\nActor: captain`)
  })

  it('preserves catch-up times through restoration, transcript copying, and a second restoration', () => {
    const saved = createInitialState(start)
    commissionFacility(saved, start)
    const before = JSON.stringify(saved)
    const restored = restoreState(saved, start + 20 * 60_000).state
    const transcript = formatTranscript(restored.transcript)
    for (const entry of restored.operations) {
      expect(transcript).toContain(`[${formatOperationTime(entry.operationAgeMs)}]`)
    }
    expect(restored.transcript.map((entry) => entry.timestamp)).toEqual(restored.operations.map((entry) => entry.timestamp))
    expect(JSON.stringify(saved)).toBe(before)
    expect(restoreState(restored, start + 20 * 60_000).state.transcript).toEqual(restored.transcript)
  })
})
