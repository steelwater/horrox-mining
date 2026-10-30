import { describe, expect, it } from 'vitest'
import { advanceFacility, applyPendingDecision, beginRequest, commissionFacility, createInitialState, recordOperation, restoreState } from '../src/game/engine'
import { finishPrompt, pauseConversations, pendingCause, preparePrompt, responseDeadline, conversationIdentity } from '../src/game/conversations'
import { decideRepair, detectFault, repairOptions } from '../src/game/repairs'
import { exportSave, parseSave } from '../src/game/portableSave'
import { recentEvents, exhibits } from '../src/game/information'
import { chatter, eligibleChatter } from '../src/game/chatter'

const start = 1_800_000_000_000
const minute = 60_000
function operation() { const state = createInitialState(start); commissionFacility(state, start); state.onboardingStatus = 'complete'; return state }

describe('conversational response clocks', () => {
  it('allows long speech, then gives fifteen full seconds before one safe outcome', () => {
    const state = operation()
    beginRequest(state, 'maintenance-coolant', start)
    const cause = pendingCause(state)!
    preparePrompt(state, cause)
    advanceFacility(state, start + 6 * minute)
    expect(state.pendingEvent).not.toBeNull()
    finishPrompt(state, cause, start + 6 * minute, false)
    advanceFacility(state, start + 6 * minute + 14_999)
    expect(state.pendingEvent).not.toBeNull()
    advanceFacility(state, start + 6 * minute + 15_000)
    expect(state.pendingEvent).toBeNull()
    expect(state.systems.coolant).toBe('inspection')
    const decisions = state.operations.filter(e => e.reason?.includes('response window elapsed'))
    expect(decisions.filter(e => !e.repair)).toHaveLength(1)
    expect(applyPendingDecision(state, '1', start + 6 * minute + 15_000)).toBeNull()
  })
  it('accepts an early decision without waiting for playback and ignores late speech completion', () => {
    const state = operation()
    beginRequest(state, 'maintenance-coolant', start)
    const cause = pendingCause(state)!
    preparePrompt(state, cause)
    expect(applyPendingDecision(state, '1', start + 100)).toBeTruthy()
    finishPrompt(state, cause, start + minute, false)
    expect(state.conversations[cause]).toBeUndefined()
    expect(state.operations.at(-1)?.resolution).toBe('manual')
  })
  it('repeat, failure, pause and reload preserve the opportunity rather than consume spoken time', () => {
    const state = operation()
    beginRequest(state, 'maintenance-coolant', start)
    const cause = pendingCause(state)!
    preparePrompt(state, cause); finishPrompt(state, cause, start, false)
    preparePrompt(state, cause)
    expect(responseDeadline(state, cause, start)).toBe(Infinity)
    finishPrompt(state, cause, start + minute, true)
    expect(state.conversations[cause]?.phase).toBe('paused')
    pauseConversations(state)
    const restored = restoreState(parseSave(exportSave(state, start), start), start + 10 * minute).state
    expect(restored.pendingEvent).not.toBeNull()
    preparePrompt(restored, cause); finishPrompt(restored, cause, start + 10 * minute, false)
    expect(responseDeadline(restored, cause, 0)).toBe(start + 10 * minute + 15_000)
  })
  it('reserves an eligible repair choice across its deadline while diagnostics and advice remain noncommitting', () => {
    const state = operation()
    const vessel = state.vessels[0]!
    const fault = detectFault(state, vessel.id, 'sensor-degradation', start)!
    preparePrompt(state, fault.id)
    finishPrompt(state, fault.id, start, false)
    const before = JSON.stringify(state.repairJobs)
    decideRepair(state, vessel, fault, 'recommend', start + 1)
    decideRepair(state, vessel, fault, 'diagnostics', start + 2)
    expect(JSON.stringify(state.repairJobs)).toBe(before)
    state.conversations[fault.id] = { phase: 'holding', deadline: null }
    advanceFacility(state, start + 16_000)
    expect(fault.action).toBeNull()
    decideRepair(state, vessel, fault, 'drone', start + 17_000)
    advanceFacility(state, start + 18_000)
    expect(state.repairJobs).toHaveLength(1)
    expect(state.conversations[fault.id]).toBeUndefined()
    expect(repairOptions(state, vessel, fault)['2']).toBeUndefined()
    expect(conversationIdentity(state, fault.id)).toMatchObject({ originatorId: 'sol-arden', vesselId: vessel.id, safeDefault: 'crew' })
  })
  it('migrates an actual schema-five shape and preserves crew, work, and preference defaults', () => {
    const state = operation()
    const envelope = JSON.parse(exportSave(state, start))
    envelope.schemaVersion = envelope.state.version = 5
    for (const key of ['conversations', 'keypadProtection', 'notableEvents']) delete envelope.state[key]
    const restored = parseSave(JSON.stringify(envelope), start)
    expect(restored.version).toBe(6)
    expect(restored.miners).toEqual(state.miners)
    expect(restored.vessels).toEqual(state.vessels)
    expect(restored.keypadProtection).toEqual({ mode: 'critical', holdSeconds: 3 })
    expect(restored.notableEvents).toEqual([]) // No invented date for old commissioning.
    restored.keypadProtection = { mode: 'all', holdSeconds: 5 }
    expect(parseSave(exportSave(restored, start), start)).toEqual(restored)
  })
  it('rejects invalid clocks, orphan requests and out-of-range protection settings', () => {
    const state = operation()
    const envelope = JSON.parse(exportSave(state, start))
    envelope.state.conversations.missing = { phase: 'response', deadline: start + 1 }
    expect(() => parseSave(JSON.stringify(envelope), start)).toThrow()
    envelope.state.conversations = {}
    envelope.state.keypadProtection.holdSeconds = 0
    expect(() => parseSave(JSON.stringify(envelope), start)).toThrow()
  })
})

describe('informational views and earned context', () => {
  it('shows only earned facts and retains them beyond radio-history rollover and import', () => {
    expect(recentEvents(createInitialState(start))).toEqual([])
    const state = operation()
    const vessel = state.vessels[0]!
    const fault = detectFault(state, vessel.id, 'sensor-degradation', start)!
    decideRepair(state, vessel, fault, 'drone', start + 1)
    advanceFacility(state, start + 40 * minute)
    expect(recentEvents(state).some(e => e.title === 'Repair completed')).toBe(true)
    expect(recentEvents(state).filter(e => e.title === 'First recorded extraction')).toHaveLength(1)
    for (let i = 0; i < 1001; i++) recordOperation(state, { timestamp: start + 40 * minute, source: 'captain', category: 'command', summary: 'Status', relatedIds: [], actionRequested: false, resolution: 'manual', reason: null })
    expect(state.operations.some(e => e.operationCode === 112)).toBe(false)
    const before = JSON.stringify(state)
    recentEvents(state); recentEvents(state)
    expect(JSON.stringify(state)).toBe(before)
    expect(recentEvents(parseSave(exportSave(state), start + 40 * minute))).toEqual(recentEvents(state))
    expect(JSON.stringify(exhibits)).not.toMatch(/Fran|Kettle|Chronolith|catastrophe/)
  })
  it('gates the operational callback on heard context, real mining work and its long cooldown', () => {
    const state = operation()
    const now = start + 60 * minute
    state.lastProcessedAt = now; state.facilityAgeMs = 60 * minute
    state.vessels[0]!.completesAt = now + 10 * minute
    const callback = chatter.find(e => e.id === 'M5-RL-sampling-callback')!
    expect(eligibleChatter(state, now)).not.toContain(callback)
    state.chatterMemory['heard:RL-01'] = 30 * minute
    expect(eligibleChatter(state, now)).toContain(callback)
    state.chatterMemory[callback.id] = 59 * minute
    expect(eligibleChatter(state, now)).not.toContain(callback)
  })
})
