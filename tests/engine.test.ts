import { describe, expect, it } from 'vitest'
import {
  CAPTAIN_TIMEOUT_MS,
  canStartEvent,
  createInitialState,
  commissionFacility,
  findEvent,
  normalizeKeyboardKey,
  nextAutopilotState,
  resolvePendingEvent,
  restoreState,
  routeKey,
} from '../src/game/engine'

describe('keypad command routing', () => {
  it('maps keyboard aliases to terminal keys', () => {
    expect(normalizeKeyboardKey('Enter')).toBe('#')
    expect(normalizeKeyboardKey('Backspace')).toBe('*')
    expect(normalizeKeyboardKey('Escape')).toBe('*')
    expect(normalizeKeyboardKey('7')).toBe('7')
    expect(normalizeKeyboardKey('a')).toBeNull()
  })

  it('keeps repeat, back, confirm, and autopilot as stable commands', () => {
    expect(routeKey('0').type).toBe('repeat')
    expect(routeKey('*').type).toBe('back')
    expect(routeKey('#').type).toBe('confirm')
    expect(routeKey('9').type).toBe('autopilot')
  })

  it('routes mining and docking through data-driven event ids', () => {
    expect(routeKey('3')).toEqual({ type: 'event', eventId: 'mining-vein-choice' })
    expect(routeKey('4')).toEqual({ type: 'event', eventId: 'docking-hauler-two' })
  })

  it('toggles autopilot without introducing a paused state', () => {
    expect(nextAutopilotState(false)).toBe(true)
    expect(nextAutopilotState(true)).toBe(false)
  })
})

describe('autonomous event resolution', () => {
  it('uses a captain response before timeout', () => {
    const result = resolvePendingEvent({ eventId: 'docking-hauler-two', requestedAt: 1_000 }, '1', 2_000)
    expect(result.resolved).toBe(true)
    expect(result.autonomous).toBe(false)
    expect(result.message).toContain('clearance')
  })

  it('resolves an ignored operational request after five minutes', () => {
    const result = resolvePendingEvent(
      { eventId: 'maintenance-coolant', requestedAt: 1_000 },
      null,
      1_000 + CAPTAIN_TIMEOUT_MS,
    )
    expect(result.resolved).toBe(true)
    expect(result.autonomous).toBe(true)
    expect(result.message).toContain('controlled inspection')
  })

  it('resolves safety events immediately', () => {
    const event = findEvent('safety-pressure-seal')!
    const result = resolvePendingEvent({ eventId: event.id, requestedAt: 1_000 }, null, 1_000)
    expect(result.resolved).toBe(true)
    expect(result.autonomous).toBe(true)
    expect(result.message).toContain('all crew clear')
  })
})

describe('persistent facility continuity', () => {
  it('advances production without punishing a returning player', () => {
    const saved = createInitialState(1_000)
    commissionFacility(saved, 1_000)
    saved.lastSavedAt = 1_000
    const restored = restoreState(saved, 38 * 60_000)
    expect(restored.completedCycles).toBe(2)
    expect(restored.state.productionCycles).toBe(2)
    expect(restored.state.oreProcessed).toBe(24)
    expect(restored.state.operations.at(-1)?.summary).toContain('Processor One')
  })
})

describe('event eligibility', () => {
  it('honors cooldowns and prerequisites', () => {
    const state = createInitialState(1_000)
    const event = {
      ...findEvent('mining-vein-choice')!,
      prerequisites: ['scanner-online'],
    }
    expect(canStartEvent(state, event, 2_000, [])).toBe(false)
    expect(canStartEvent(state, event, 2_000, ['scanner-online'])).toBe(true)
    state.eventCooldowns[event.id] = 3_000
    expect(canStartEvent(state, event, 2_000, ['scanner-online'])).toBe(false)
  })
})
