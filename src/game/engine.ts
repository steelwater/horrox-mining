import { events } from './content'
import type { EventDefinition, FacilityState, KeypadKey, PendingEvent } from './types'

export const CAPTAIN_TIMEOUT_MS = 300_000
export const PRODUCTION_CYCLE_MS = 15 * 60_000

export type TerminalCommand =
  | { type: 'repeat' }
  | { type: 'back' }
  | { type: 'confirm' }
  | { type: 'autopilot' }
  | { type: 'status'; message: string }
  | { type: 'event'; eventId: string }

const topLevelCommands: Record<KeypadKey, TerminalCommand> = {
  '0': { type: 'repeat' },
  '1': { type: 'event', eventId: 'safety-pressure-seal' },
  '2': { type: 'status', message: 'Crew operations. Three miners are on shift. All personnel report nominal status.' },
  '3': { type: 'event', eventId: 'mining-vein-choice' },
  '4': { type: 'event', eventId: 'docking-hauler-two' },
  '5': { type: 'event', eventId: 'maintenance-coolant' },
  '6': { type: 'status', message: 'Processing and cargo. Refinery line one is active. Storage remains within operating limits.' },
  '7': { type: 'event', eventId: 'problem-sensor-drift' },
  '8': { type: 'status', message: 'Facility status nominal. Power, atmosphere, docking, and extraction systems are online.' },
  '9': { type: 'autopilot' },
  '*': { type: 'back' },
  '#': { type: 'confirm' },
}

export function routeKey(key: KeypadKey): TerminalCommand {
  return topLevelCommands[key]
}

export function normalizeKeyboardKey(key: string): KeypadKey | null {
  if (/^[0-9]$/.test(key)) return key as KeypadKey
  if (key === '*' || key === 'Backspace' || key === 'Escape') return '*'
  if (key === '#' || key === 'Enter') return '#'
  return null
}

export function findEvent(id: string): EventDefinition | undefined {
  return events.find((event) => event.id === id)
}

export function resolvePendingEvent(
  pending: PendingEvent,
  key: KeypadKey | null,
  now: number,
): { resolved: boolean; message: string; autonomous: boolean } {
  const event = findEvent(pending.eventId)
  if (!event) return { resolved: true, message: 'The pending event is no longer available.', autonomous: true }

  if (event.immediateSafety) {
    return { resolved: true, message: event.autonomousFallback, autonomous: true }
  }

  if (key && event.responseOptions[key]) {
    return { resolved: true, message: event.responseOptions[key]!, autonomous: false }
  }

  if (now - pending.requestedAt >= event.responseTimeoutMs) {
    return { resolved: true, message: event.autonomousFallback, autonomous: true }
  }

  return { resolved: false, message: '', autonomous: false }
}

export function createInitialState(now: number): FacilityState {
  return {
    version: 1,
    createdAt: now,
    lastSavedAt: now,
    facilityAgeMs: 0,
    productionCycles: 0,
    oreProcessed: 0,
    equipmentWear: 0,
    autopilotEnabled: false,
    onboardingStatus: 'pending',
    onboardingStep: 0,
    pendingEvent: null,
    eventCooldowns: {},
    history: [],
    transcript: [],
  }
}

export function restoreState(saved: FacilityState, now: number): { state: FacilityState; elapsedMs: number; completedCycles: number } {
  const elapsedMs = Math.max(0, now - saved.lastSavedAt)
  const completedCycles = Math.floor(elapsedMs / PRODUCTION_CYCLE_MS)
  return {
    elapsedMs,
    completedCycles,
    state: {
      ...saved,
      lastSavedAt: now,
      facilityAgeMs: saved.facilityAgeMs + elapsedMs,
      productionCycles: saved.productionCycles + completedCycles,
      oreProcessed: saved.oreProcessed + completedCycles * 12,
      equipmentWear: Math.min(100, saved.equipmentWear + completedCycles * 0.15),
      history: completedCycles > 0
        ? [...saved.history, `${completedCycles} extraction cycle${completedCycles === 1 ? '' : 's'} completed under automated control.`].slice(-100)
        : saved.history,
    },
  }
}

export function canStartEvent(
  state: FacilityState,
  event: EventDefinition,
  now: number,
  availablePrerequisites: string[] = [],
): boolean {
  const prerequisitesMet = event.prerequisites.every((item) => availablePrerequisites.includes(item))
  return !state.pendingEvent && prerequisitesMet && (state.eventCooldowns[event.id] ?? 0) <= now
}

export function nextAutopilotState(current: boolean): boolean {
  return !current
}
