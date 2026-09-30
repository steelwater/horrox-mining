import { describe, expect, it } from 'vitest'
import { chatter, chatterContextMatches, eligibleChatter } from '../src/game/chatter'
import { advanceFacility, commissionFacility, createInitialState, recordOperation, returnBriefing, shouldBriefOnReturn } from '../src/game/engine'
import { decideRepair, detectFault, repairOptions } from '../src/game/repairs'
import { exportSave, parseSave } from '../src/game/portableSave'

const start = 1_800_000_000_000
const minute = 60_000
function operation() {
  const state = createInitialState(start)
  commissionFacility(state, start)
  state.onboardingStatus = 'complete'
  return state
}

describe('operational chatter', () => {
  it('does not describe a working excavator during a fault, hold, return or service', () => {
    const state = operation()
    const exchange = chatter.find((e) => e.id === 'productive-confidence')!
    expect(chatterContextMatches(state, exchange)).toBe(true)
    detectFault(state, state.vessels[0]!.id, 'sensor-degradation', start)
    expect(chatterContextMatches(state, exchange)).toBe(false)
    decideRepair(state, state.vessels[0]!, state.vessels[0]!.activeFaults[0]!, 'drone', start)
    advanceFacility(state, start + 3 * minute)
    expect(chatterContextMatches(state, exchange)).toBe(false)
    expect(chatterContextMatches(state, chatter.find((e) => e.context === 'service')!)).toBe(true)
    expect(chatterContextMatches(state, chatter.find((e) => e.context === 'maintenance')!)).toBe(false)
  })

  it('requires docked traffic and actual processing loads instead of inventing early arrivals or work', () => {
    const state = operation()
    const dock = chatter.find((e) => e.context === 'dock')!
    const processing = chatter.find((e) => e.context === 'processing')!
    expect(chatterContextMatches(state, dock)).toBe(false)
    expect(chatterContextMatches(state, processing)).toBe(false)
    state.vessels[1]!.dockingState = 'docked'
    state.processingQueue.push({ id: 'load', vesselId: state.vessels[1]!.id, tonnes: 1, completesAt: start + minute })
    expect(chatterContextMatches(state, dock)).toBe(true)
    expect(chatterContextMatches(state, processing)).toBe(true)
    state.systems.coolant = 'inspection'
    expect(chatterContextMatches(state, processing)).toBe(false)
    expect(chatter.some((e) => e.id === 'early-hauler')).toBe(false)
  })

  it('preserves long exchange cooldowns through export/import and transcript rollover', () => {
    const state = operation()
    const exchange = chatter[0]!
    recordOperation(state, { timestamp: start + minute, source: 'Patch', category: 'chatter', summary: exchange.lines[0]!.text, relatedIds: [exchange.id], actionRequested: false, resolution: 'autonomous', reason: null })
    advanceFacility(state, start + minute)
    const restored = parseSave(exportSave(state), start + minute)
    expect(eligibleChatter(restored, start + 10 * minute).some((e) => e.id === exchange.id)).toBe(false)
    expect(eligibleChatter(restored, start + 61 * minute).some((e) => e.id === exchange.id)).toBe(true)
    expect(restored.version).toBe(4)
  })

  it('keeps a two-hour unattended transcript varied with no short repeat loops', () => {
    const state = operation()
    const heard = new Map<string, number>()
    let count = 0
    for (let seconds = 90; seconds <= 7200; seconds += 90) {
      const now = start + seconds * 1000
      advanceFacility(state, now)
      const options = eligibleChatter(state, now)
      const exchange = options[(seconds / 90) % Math.max(1, options.length)]
      if (!exchange) continue
      expect(seconds - (heard.get(exchange.id) ?? -Infinity)).toBeGreaterThanOrEqual(exchange.cooldownMs / 1000)
      heard.set(exchange.id, seconds)
      count++
      recordOperation(state, { timestamp: now, source: exchange.lines[0]!.speaker, category: 'chatter', summary: exchange.lines[0]!.text, relatedIds: [exchange.id], actionRequested: false, resolution: 'autonomous', reason: null })
    }
    expect(heard.size).toBeGreaterThanOrEqual(10)
    expect(count).toBeLessThan(40)
    expect(state.oreProcessed).toBeGreaterThan(0)
  })

  it('yields to new operational traffic, pending decisions and emergencies', () => {
    const state = operation()
    expect(eligibleChatter(state, start + minute).length).toBeGreaterThan(0)
    recordOperation(state, { timestamp: start + minute, source: 'facility', category: 'processing', summary: 'Load processed.', relatedIds: [], actionRequested: false, resolution: 'autonomous', reason: null })
    expect(eligibleChatter(state, start + minute)).toEqual([])
    state.pendingEvent = { eventId: 'docking-hauler-two', requestedAt: start }
    expect(eligibleChatter(state, start + 2 * minute)).toEqual([])
    state.pendingEvent = null
    detectFault(state, state.vessels[0]!.id, 'power-instability', start)
    expect(eligibleChatter(state, start + 2 * minute)).toEqual([])
  })
})

describe('repair requests and reconnects', () => {
  it('uses telemetry when voice communications fail and offers only valid recovery actions', () => {
    const state = operation()
    const vessel = state.vessels[0]!
    const fault = detectFault(state, vessel.id, 'communications-failure', start)!
    expect(state.operations.at(-1)?.source).toBe('facility')
    expect(state.operations.at(-1)?.summary).toContain('telemetry')
    detectFault(state, vessel.id, 'power-instability', start)
    expect(repairOptions(state, vessel, fault)['3']).toBeUndefined()
    expect(repairOptions(state, vessel, fault)['5']).toBeUndefined()
    state.repairDrones[0]!.state = 'maintenance'
    expect(repairOptions(state, vessel, fault)['2']?.label).toBe('Queue drone support')
  })

  it('uses honest waiting wording and resolves an unanswered request autonomously', () => {
    const state = operation()
    advanceFacility(state, start + 7 * minute)
    expect(state.repairJobs[0]?.state).toBe('dispatched')
    expect(state.operations.some((e) => e.reason?.includes('response window elapsed'))).toBe(true)
    expect(state.operations.map((e) => e.summary).join(' ')).not.toContain('until a drone is free')
    expect(state.operations[0]?.source).toBe('sol-arden')
  })

  it('suppresses short unchanged returns only after a recent full briefing', () => {
    const state = operation()
    expect(shouldBriefOnReturn(state, start, start + 1000, state.nextOperationId)).toBe(true)
    state.transcript.push({ id: 'brief', timestamp: start, operationAgeMs: 0, priority: 2, speaker: 'Facility Control', text: returnBriefing(state, start, start) })
    expect(shouldBriefOnReturn(state, start, start + 1000, state.nextOperationId)).toBe(false)
    expect(shouldBriefOnReturn(state, start, start + 5 * minute, state.nextOperationId)).toBe(true)
    expect(shouldBriefOnReturn(state, start, start + 1000, state.nextOperationId - 1)).toBe(true)
    state.pendingEvent = { eventId: 'docking-hauler-two', requestedAt: start }
    expect(shouldBriefOnReturn(state, start, start + 1000, state.nextOperationId)).toBe(true)
    state.transcript[0]!.text = returnBriefing(state, start, start)
    expect(shouldBriefOnReturn(state, start, start + 1000, state.nextOperationId)).toBe(false)
  })

  it('includes work completed in a sub-minute absence and uses singular elapsed units', () => {
    const state = operation()
    recordOperation(state, { timestamp: start + 1000, source: 'facility', category: 'processing', summary: 'One load processed.', relatedIds: [], actionRequested: false, resolution: 'autonomous', reason: null })
    expect(returnBriefing(state, start, start + 2000)).toContain('One load processed.')
    expect(returnBriefing(state, start, start + minute)).toContain('1 minute.')
    expect(returnBriefing(state, start, start + 61 * minute)).toContain('1 hour and 1 minute.')
  })
})
