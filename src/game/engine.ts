import { OPERATION_START, operationAgeAt } from './calendar'
import { events, miners } from './content'
import type { EventDefinition, FacilityState, KeypadKey, PendingEvent, OperationalEvent } from './types'

export const CAPTAIN_TIMEOUT_MS = 300_000
export const PRODUCTION_CYCLE_MS = 15 * 60_000

export type TerminalCommand =
  | { type: 'repeat' }
  | { type: 'back' }
  | { type: 'confirm' }
  | { type: 'autopilot' }
  | { type: 'status' }
  | { type: 'event'; eventId: string }

const topLevelCommands: Record<KeypadKey, TerminalCommand> = {
  '0': { type: 'repeat' },
  '1': { type: 'event', eventId: 'safety-pressure-seal' },
  '2': { type: 'status' },
  '3': { type: 'event', eventId: 'mining-vein-choice' },
  '4': { type: 'event', eventId: 'docking-hauler-two' },
  '5': { type: 'event', eventId: 'maintenance-coolant' },
  '6': { type: 'status' },
  '7': { type: 'event', eventId: 'problem-sensor-drift' },
  '8': { type: 'status' },
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

  if (key && event.responseOptions[key] && now - pending.requestedAt < event.responseTimeoutMs) {
    return { resolved: true, message: event.responseOptions[key]!, autonomous: false }
  }

  if (now - pending.requestedAt >= event.responseTimeoutMs) {
    return { resolved: true, message: event.autonomousFallback, autonomous: true }
  }

  return { resolved: false, message: '', autonomous: false }
}

export function createInitialState(now: number): FacilityState {
  return {
    version: 3,
    operationStart: OPERATION_START,
    commissioned: false,
    lastProcessedAt: now,
    lastActiveAt: now,
    miners: JSON.parse(JSON.stringify(miners)),
    vessels: [
      { id: 'excavator-03', name: 'Excavator Three', minerId: 'sol-arden', condition: 'nominal', dockingState: 'docked', assignment: 'standby', startedAt: now, completesAt: null, cargo: 0, delivered: 0, run: 1, miningProgress: 0, cut: 'stable' },
      { id: 'hauler-02', name: 'Hauler Two', minerId: 'mara-vale', condition: 'nominal', dockingState: 'holding', assignment: 'standby', startedAt: now, completesAt: null, cargo: 0, delivered: 0, run: 0, miningProgress: 0, cut: 'stable' },
    ],
    repairDrones: [{ id: 'dr-01', targetId: null, completesAt: null }],
    processingQueue: [],
    systems: { berth: 'open', berthInspectionAt: null, coolant: 'nominal', coolantInspectionAt: null, scanner: 'nominal', scannerCalibrationAt: null },
    operations: [],
    nextOperationId: 1,
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
  const state = JSON.parse(JSON.stringify(saved)) as FacilityState
  const elapsedMs = safeElapsed(saved.lastActiveAt, now)
  const before = state.productionCycles
  advanceFacility(state, now)
  state.lastActiveAt = Math.max(state.lastActiveAt, now)
  return { state, elapsedMs, completedCycles: state.productionCycles - before }
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

export const MAX_CATCHUP_MS = 7 * 24 * 60 * 60_000
const TRANSIT_MS = 2 * 60_000
const PROCESSING_MS = 3 * 60_000
const SERVICE_MS = 5 * 60_000

export function safeElapsed(from: number, now: number): number {
  return Number.isFinite(from) && Number.isFinite(now) && from >= 0 && now >= from
    ? Math.min(now - from, MAX_CATCHUP_MS) : 0
}

export function recordOperation(state: FacilityState, event: Omit<OperationalEvent, 'id' | 'operationAgeMs'>): void {
  state.operations.push({ ...event, operationAgeMs: operationAgeAt(state, event.timestamp), id: `op-${state.nextOperationId++}` })
  state.operations = state.operations.slice(-1000)
}

function routine(state: FacilityState, timestamp: number, source: string, category: OperationalEvent['category'], summary: string, relatedIds: string[], reason: string): void {
  recordOperation(state, { timestamp, source, category, summary, relatedIds, actionRequested: false, resolution: 'autonomous', reason })
}

export function beginRequest(state: FacilityState, eventId: string, now: number): boolean {
  const event = findEvent(eventId)
  if (!event || !canStartEvent(state, event, now)) return false
  state.eventCooldowns[event.id] = now + event.cooldownMs
  state.pendingEvent = { eventId, requestedAt: now }
  recordOperation(state, { timestamp: now, source: event.participants[0] ?? 'facility', category: event.type, summary: event.spokenLines.join(' '), relatedIds: event.participants, actionRequested: !event.immediateSafety, resolution: 'pending', reason: null })
  if (event.immediateSafety) applyPendingDecision(state, null, now)
  return true
}

export function applyPendingDecision(state: FacilityState, key: KeypadKey | null, now: number): string | null {
  const pending = state.pendingEvent
  if (!pending) return null
  const result = resolvePendingEvent(pending, key, now)
  if (!result.resolved) return null
  const event = findEvent(pending.eventId)
  state.pendingEvent = null
  if (!event) return result.message
  const automatic = result.autonomous
  const choice = automatic ? null : key
  const vessel = state.vessels.find((item) => item.id === 'excavator-03')!
  const hauler = state.vessels.find((item) => item.id === 'hauler-02')!
  let source = automatic ? event.participants[0]! : 'captain'
  let reason = automatic ? 'The response window elapsed. Crew selected the established safe procedure.' : null
  let message = result.message
  if (event.type === 'mining') {
    vessel.cut = choice === '1' ? 'dense' : 'stable'
    if (vessel.assignment === 'extraction') {
      vessel.completesAt = Math.max(now, vessel.startedAt + extractionDuration(vessel.cut))
    }
  }
  if (event.type === 'docking') {
    if (state.systems.berth === 'isolated') {
      source = 'facility'
      reason = 'Berth Four is isolated. Approach clearance cannot be issued safely.'
      message = 'Facility control has held Hauler Two outside the beacon until berth inspection is complete.'
      hauler.dockingState = 'holding'
      hauler.assignment = 'standby'
      hauler.completesAt = null
    } else if (choice !== '2') {
      hauler.dockingState = 'approaching'
      hauler.assignment = 'approach'
      hauler.startedAt = now
      hauler.completesAt = now + TRANSIT_MS
    } else {
      hauler.dockingState = 'holding'
      hauler.assignment = 'standby'
      hauler.completesAt = null
    }
  }
  if (event.type === 'maintenance') {
    state.systems.coolant = 'inspection'
    state.systems.coolantInspectionAt = (choice === '1' ? now : Math.max(now, ...state.processingQueue.map((load) => load.completesAt))) + SERVICE_MS
  }
  if (event.type === 'problem') {
    state.systems.scanner = 'manual-sampling'
    state.systems.scannerCalibrationAt = now + SERVICE_MS
    if (automatic) {
      source = 'facility'
      reason = 'Scanner reliability affects extraction and processing. Manual sampling preserves safe operation during calibration.'
      message = 'Facility control has assigned manual sampling and scanner recalibration. Extraction can continue safely.'
    }
  }
  if (event.immediateSafety) {
    source = 'facility'
    reason = 'Pressure variance requires immediate berth isolation to protect crew and equipment.'
    state.systems.berth = 'isolated'
    state.systems.berthInspectionAt = now + SERVICE_MS
    if (hauler.assignment === 'approach') {
      hauler.assignment = 'standby'
      hauler.dockingState = 'holding'
      hauler.completesAt = null
    }
  }
  recordOperation(state, { timestamp: now, source, category: event.type, summary: message, relatedIds: [...event.participants, ...(event.type === 'mining' ? [vessel.id] : event.type === 'docking' ? [hauler.id, 'berth-04'] : [event.type === 'maintenance' ? 'coolant' : event.type === 'problem' ? 'scanner' : 'berth-04'])], actionRequested: !event.immediateSafety, resolution: automatic || source === 'facility' ? 'autonomous' : 'manual', reason })
  for (const miner of state.miners.filter((item) => event.participants.includes(item.id))) {
    miner.history = [...miner.history, message].slice(-100)
  }
  state.history = [...state.history, `${event.id}: ${message}`].slice(-100)
  return message
}

// One event clock drives both foreground work and reconnect catch-up. No per-second replay.
export function advanceFacility(state: FacilityState, now: number): void {
  if (!Number.isFinite(now) || now < state.lastProcessedAt) return
  const end = state.lastProcessedAt + safeElapsed(state.lastProcessedAt, now)
  if (!state.commissioned) {
    state.facilityAgeMs += now - state.lastProcessedAt
    state.lastProcessedAt = now
    return
  }
  for (const vessel of state.vessels) {
    if (vessel.condition === 'service-required' && vessel.assignment === 'extraction') {
      vessel.assignment = 'delivery'
      vessel.dockingState = 'returning'
      vessel.startedAt = state.lastProcessedAt
      vessel.completesAt = state.lastProcessedAt + TRANSIT_MS
      routine(state, state.lastProcessedAt, 'facility', 'maintenance', `${vessel.name} suspended extraction and is returning for service.`, [vessel.id], 'Continuing extraction with a service requirement is unnecessary operational risk.')
    }
  }
  dispatchRoutineService(state, state.lastProcessedAt)
  while (true) {
    const pendingAt = state.pendingEvent
      ? state.pendingEvent.requestedAt + (findEvent(state.pendingEvent.eventId)?.responseTimeoutMs ?? 0) : Infinity
    const deadlines = [pendingAt, ...state.vessels.map((v) => v.completesAt ?? Infinity), ...state.repairDrones.map((d) => d.completesAt ?? Infinity), ...state.processingQueue.map((q) => q.completesAt), state.systems.berthInspectionAt ?? Infinity, state.systems.coolantInspectionAt ?? Infinity, state.systems.scannerCalibrationAt ?? Infinity]
    const next = Math.min(...deadlines)
    if (next > end) break
    const at = Math.max(state.lastProcessedAt, next)
    state.facilityAgeMs += at - state.lastProcessedAt
    state.lastProcessedAt = at
    if (pendingAt <= at) applyPendingDecision(state, null, at)
    const systems = state.systems
    if (systems.berthInspectionAt !== null && systems.berthInspectionAt <= at) {
      systems.berth = 'open'
      systems.berthInspectionAt = null
      routine(state, at, 'facility', 'maintenance', 'Berth Four inspection complete. Docking is available.', ['berth-04'], 'Inspection confirmed safe pressure.')
    }
    if (systems.coolantInspectionAt !== null && systems.coolantInspectionAt <= at) {
      systems.coolant = 'nominal'
      systems.coolantInspectionAt = null
      routine(state, at, 'iko-ren', 'maintenance', 'Coolant pump inspection complete. Normal service restored.', ['coolant'], 'Routine inspection completed safely.')
    }
    if (systems.scannerCalibrationAt !== null && systems.scannerCalibrationAt <= at) {
      systems.scanner = 'nominal'
      systems.scannerCalibrationAt = null
      routine(state, at, 'facility', 'maintenance', 'Ore scanner calibration complete.', ['scanner'], 'Automatic calibration restored reliable readings.')
    }
    for (const drone of state.repairDrones) {
      if (drone.completesAt === null || drone.completesAt > at) continue
      const vessel = state.vessels.find((v) => v.id === drone.targetId)
      if (vessel) {
        vessel.condition = 'nominal'
        vessel.assignment = 'extraction'
        vessel.dockingState = 'deployed'
        vessel.startedAt = at
        vessel.completesAt = at + extractionDuration(vessel.cut)
        vessel.run++
        routine(state, at, drone.id, 'maintenance', `${drone.id.toUpperCase()} completed routine service on ${vessel.name}. Extraction resumed.`, [drone.id, vessel.id], 'Routine service completed before redeployment.')
      }
      drone.targetId = null
      drone.completesAt = null
    }
    for (const vessel of state.vessels) {
      if (vessel.completesAt === null || vessel.completesAt > at) continue
      if (vessel.assignment === 'extraction') {
        vessel.cargo = vessel.cut === 'dense' ? 16 : 12
        vessel.miningProgress = 1
        vessel.assignment = 'delivery'
        vessel.dockingState = 'returning'
        vessel.startedAt = at
        vessel.completesAt = at + TRANSIT_MS
        state.productionCycles++
        routine(state, at, vessel.minerId, 'mining', `${vessel.name} completed extraction run ${vessel.run}. Returning with ${vessel.cargo} tonnes.`, [vessel.id, vessel.minerId], 'The assigned run is complete. Crew is delivering the cargo.')
      } else if (state.systems.berth === 'isolated') {
        vessel.completesAt = state.systems.berthInspectionAt ?? at + SERVICE_MS
        vessel.dockingState = 'holding'
        routine(state, at, 'facility', 'docking', `${vessel.name} is holding clear of Berth Four.`, [vessel.id, 'berth-04'], 'Docking awaits a safe berth.')
      } else if (vessel.assignment === 'delivery') {
        const tonnes = vessel.cargo
        vessel.delivered += tonnes
        vessel.cargo = 0
        const startsAt = Math.max(at, ...state.processingQueue.map((load) => load.completesAt))
        if (tonnes > 0) state.processingQueue.push({ id: `${vessel.id}-run-${vessel.run}`, vesselId: vessel.id, tonnes, completesAt: startsAt + PROCESSING_MS })
        routine(state, at, vessel.minerId, 'docking', `${vessel.name} delivered ${tonnes} tonnes to Processor One.`, [vessel.id, 'processor-01'], 'Cargo transferred before the next assignment.')
        vessel.miningProgress = 0
        // A routine service stop every fourth run; no damage is caused by absence.
        if (vessel.condition === 'service-required' || vessel.run % 4 === 0) {
          vessel.condition = 'service-required'
          vessel.assignment = 'standby'
          vessel.dockingState = 'docked'
          vessel.completesAt = null
        } else {
          vessel.run++
          vessel.assignment = 'extraction'
          vessel.dockingState = 'deployed'
          vessel.startedAt = at
          vessel.completesAt = at + extractionDuration(vessel.cut)
        }
      } else {
        vessel.assignment = 'standby'
        vessel.dockingState = 'docked'
        vessel.completesAt = null
        routine(state, at, vessel.minerId, 'docking', `${vessel.name} is secured at Berth Four.`, [vessel.id], 'Standard approach completed safely.')
      }
    }
    dispatchRoutineService(state, at)
    for (const load of state.processingQueue.filter((q) => q.completesAt <= at)) {
      state.oreProcessed += load.tonnes
      routine(state, at, 'processor-01', 'processing', `Processor One completed a ${load.tonnes} tonne load.`, [load.vesselId, 'processor-01'], 'Queued processing completed normally.')
    }
    state.processingQueue = state.processingQueue.filter((q) => q.completesAt > at)
    state.lastProcessedAt = at
  }
  for (const vessel of state.vessels) {
    if (vessel.assignment === 'extraction' && vessel.completesAt !== null) {
      vessel.miningProgress = Math.min(1, Math.max(0, (end - vessel.startedAt) / (vessel.completesAt - vessel.startedAt)))
    }
    const miner = state.miners.find((m) => m.id === vessel.minerId)
    if (miner) miner.currentAssignment = `${vessel.name}: ${vessel.assignment}`
  }
  // Very long absences complete at most seven days of work. Preserve remaining work,
  // then consume the entire wall-clock interval so it cannot be replayed.
  const skipped = now - end
  if (skipped > 0) {
    for (const v of state.vessels) { v.startedAt += skipped; if (v.completesAt !== null) v.completesAt += skipped }
    for (const d of state.repairDrones) if (d.completesAt !== null) d.completesAt += skipped
    for (const q of state.processingQueue) q.completesAt += skipped
    for (const field of ['berthInspectionAt', 'coolantInspectionAt', 'scannerCalibrationAt'] as const) if (state.systems[field] !== null) state.systems[field] += skipped
  }
  // Calendar age includes the skipped interval; only operational work is bounded.
  state.facilityAgeMs += now - state.lastProcessedAt
  state.lastProcessedAt = now
}

export function operationalStatus(state: FacilityState): string {
  const active = state.vessels.filter((v) => v.assignment === 'extraction').length
  const docked = state.vessels.filter((v) => v.dockingState === 'docked').length
  const travelling = state.vessels.length - active - docked
  const assigned = state.repairDrones.filter((d) => d.targetId !== null).length
  const warnings = [state.systems.berth === 'isolated' ? 'Berth Four isolated.' : '', state.systems.coolant === 'inspection' ? 'Coolant inspection in progress.' : '', state.systems.scanner === 'manual-sampling' ? 'Manual sampling active during scanner calibration.' : ''].filter(Boolean)
  return `${active} mining vessel active. ${docked} docked. ${travelling} in transit or holding. ${state.pendingEvent ? 1 : 0} crew request awaiting attention. ${assigned} repair drones assigned. ${state.repairDrones.length - assigned} available. Processor One has ${state.processingQueue.length} queued loads. ${warnings.join(' ') || 'No major facility warnings.'} ${state.pendingEvent ? 'One decision pending.' : 'No decisions pending.'}`
}

export function returnBriefing(state: FacilityState, since: number, now: number): string {
  const elapsed = Number.isFinite(since) ? Math.max(0, now - since) : 0
  if (elapsed < 60_000) return `Captain terminal connected. ${operationalStatus(state)}`
  const entries = state.operations.filter((event) => event.timestamp > since && event.resolution !== 'pending')
  const priority = (event: OperationalEvent) => event.category === 'safety' || (event.actionRequested && event.resolution === 'autonomous') ? 0 : event.category === 'maintenance' ? 1 : 2
  const selected = [...entries].sort((a, b) => priority(a) - priority(b) || b.timestamp - a.timestamp).slice(0, 4).sort((a, b) => a.timestamp - b.timestamp)
  const minutes = Math.floor(elapsed / 60_000)
  const duration = minutes >= 60 ? `${Math.floor(minutes / 60)} hours and ${minutes % 60} minutes` : `${minutes} minutes`
  return `Captain terminal connected. Elapsed since last connection: ${duration}. ${elapsed > MAX_CATCHUP_MS ? 'Catch-up is limited to seven days of operations. ' : ''}${selected.length ? `During your absence: ${selected.map((event) => event.summary).join(' ')}` : 'No significant operational changes during your absence.'} ${state.pendingEvent ? 'One request is awaiting your preference.' : 'No intervention is required.'} Press 0 for current status. Operational history is available in the terminal.`
}

function dispatchRoutineService(state: FacilityState, at: number): void {
  for (const vessel of state.vessels.filter((v) => v.condition === 'service-required' && v.dockingState === 'docked')) {
    if (state.repairDrones.some((d) => d.targetId === vessel.id)) continue
    const drone = state.repairDrones.find((d) => d.targetId === null)
    if (!drone) continue
    drone.targetId = vessel.id
    drone.completesAt = at + SERVICE_MS
    routine(state, at, 'facility', 'maintenance', `${drone.id.toUpperCase()} assigned to routine service on ${vessel.name}.`, [drone.id, vessel.id], 'Scheduled service protects equipment before the next run.')
  }
}

function extractionDuration(cut: 'stable' | 'dense'): number {
  return PRODUCTION_CYCLE_MS + (cut === 'dense' ? 5 * 60_000 : 0)
}

export function commissionFacility(state: FacilityState, now: number): void {
  if (state.commissioned) return
  state.commissioned = true
  const vessel = state.vessels.find((item) => item.id === 'excavator-03')!
  vessel.assignment = 'extraction'
  vessel.dockingState = 'deployed'
  vessel.startedAt = now
  vessel.completesAt = now + extractionDuration(vessel.cut)
}
