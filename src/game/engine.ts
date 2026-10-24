import { autonomyExplanation, miningReporter, updateCrewState } from './crew'
import { quantity } from './text'
import { activeFaults, advanceRepairs, detectFault, detectOperationalWear, droneStatus, miningEfficiency, pendingFaults, repairDeadlines, faultLibrary, scheduleRepairs, vesselRepairStatus } from './repairs'
import { OPERATION_START, operationAgeAt, formatOperationTime } from './calendar'
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
    version: 5,
    chatterMemory: {},
    operationStart: OPERATION_START,
    commissioned: false,
    lastProcessedAt: now,
    lastActiveAt: now,
    miners: JSON.parse(JSON.stringify(miners)),
    vessels: [
      { id: 'excavator-03', name: 'Excavator Three', minerId: 'sol-arden', condition: 'nominal', routineServiceDue: false, runsSinceService: 0, activeFaults: [], serviceHistory: [], operatingRuns: 0, lastFaultRun: 0, resumeAfterRepair: false, dockingState: 'docked', assignment: 'standby', startedAt: now, completesAt: null, cargo: 0, delivered: 0, run: 1, miningProgress: 0, cut: 'stable' },
      { id: 'hauler-02', name: 'Hauler Two', minerId: 'mara-vale', condition: 'nominal', routineServiceDue: false, runsSinceService: 0, activeFaults: [], serviceHistory: [], operatingRuns: 0, lastFaultRun: 0, resumeAfterRepair: false, dockingState: 'holding', assignment: 'standby', startedAt: now, completesAt: null, cargo: 0, delivered: 0, run: 0, miningProgress: 0, cut: 'stable' },
    ],
    repairDrones: [{ id: 'dr-01', name: 'Repair Drone One', targetId: null, completesAt: null, state: 'available', location: 'facility', assignedJobId: null, transitStartedAt: null, serviceStartedAt: null, maintenanceDue: false, serviceHistory: [] }],
    repairJobs: [],
    nextRepairId: 1,
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
  // Older terminals could open requests before commissioning, when their
  // response clocks could not run. They are not valid work to replay later.
  if (!state.commissioned) state.pendingEvent = null
  const elapsedMs = safeElapsed(saved.lastActiveAt, now)
  const before = state.productionCycles
  advanceFacility(state, now)
  recordAbsenceTranscript(state, saved.nextOperationId)
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

function routine(state: FacilityState, timestamp: number, source: string, category: OperationalEvent['category'], summary: string, relatedIds: string[], reason: string, operationCode?: number): void {
  recordOperation(state, { timestamp, source, category, summary, relatedIds, actionRequested: false, resolution: 'autonomous', reason, ...(operationCode ? { operationCode } : {}) })
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
  if (automatic && !event.immediateSafety && source !== 'facility') {
    const explanation = autonomyExplanation(state.miners.find((crew) => crew.id === source))
    reason = `${reason} ${explanation}`
    message = `${message} ${explanation}`
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
  dispatchRoutineService(state, state.lastProcessedAt)
  scheduleRepairs(state, state.lastProcessedAt)
  while (true) {
    const pendingAt = state.pendingEvent
      ? state.pendingEvent.requestedAt + (findEvent(state.pendingEvent.eventId)?.responseTimeoutMs ?? 0) : Infinity
    // One early sensor report on the first active run; the persistent repair counter
    // prevents replay after reload. Later wear retains the conservative run cadence.
    const firstVessel = state.vessels.find((v) => v.id === 'excavator-03')!
    const firstFaultAt = state.nextRepairId === 1 && firstVessel.assignment === 'extraction'
      ? firstVessel.startedAt + 2 * 60_000 : Infinity
    const deadlines = [firstFaultAt, ...repairDeadlines(state), pendingAt, ...state.vessels.map((v) => v.completesAt ?? Infinity), ...state.repairDrones.map((d) => d.completesAt ?? Infinity), ...state.processingQueue.map((q) => q.completesAt), state.systems.berthInspectionAt ?? Infinity, state.systems.coolantInspectionAt ?? Infinity, state.systems.scannerCalibrationAt ?? Infinity]
    const next = Math.min(...deadlines)
    if (next > end) break
    const at = Math.max(state.lastProcessedAt, next)
    state.facilityAgeMs += at - state.lastProcessedAt
    state.lastProcessedAt = at
    if (firstFaultAt <= at) detectFault(state, firstVessel.id, 'sensor-degradation', at)
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
    advanceRepairs(state, at)
    for (const drone of state.repairDrones) {
      if (drone.assignedJobId !== null || drone.state !== 'servicing') continue
      if (drone.completesAt === null || drone.completesAt > at) continue
      const vessel = state.vessels.find((v) => v.id === drone.targetId)
      if (vessel) {
        vessel.routineServiceDue = false
        vessel.assignment = activeFaults(vessel).length ? 'standby' : 'extraction'
        vessel.dockingState = activeFaults(vessel).length ? 'docked' : 'deployed'
        vessel.startedAt = at
        vessel.completesAt = vessel.assignment === 'extraction' ? at + extractionDuration(vessel.cut) : null
        vessel.runsSinceService = 0
        routine(state, at, drone.id, 'maintenance', `${drone.id.toUpperCase()} completed routine service on ${vessel.name}. ${activeFaults(vessel).length ? 'Vessel remains held for fault repair.' : 'Extraction resumed.'}`, [drone.id, vessel.id], 'Routine service completed before redeployment.', 245)
      }
      drone.targetId = null
      drone.completesAt = null
      drone.state = 'available'
      drone.location = 'facility'
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
        vessel.runsSinceService++
        detectOperationalWear(state, vessel, 'extraction', at)
        const canDeliver = miningEfficiency(vessel) > 0
        routine(state, at, miningReporter(state, vessel), 'mining', `${vessel.name} completed extraction run ${vessel.run}. ${canDeliver ? `Returning with ${vessel.cargo} tonnes.` : `Holding ${vessel.cargo} tonnes safely pending repair.`}`, [vessel.id, vessel.minerId], canDeliver ? 'The assigned run is complete. Crew is delivering the cargo.' : 'The assigned run is complete; unsafe transit is suspended.', 112)
      } else if (state.systems.berth === 'isolated') {
        vessel.completesAt = state.systems.berthInspectionAt ?? at + SERVICE_MS
        vessel.dockingState = 'holding'
        routine(state, at, 'facility', 'docking', `${vessel.name} is holding clear of Berth Four.`, [vessel.id, 'berth-04'], 'Docking awaits a safe berth.')
      } else if (vessel.assignment === 'delivery') {
        vessel.dockingState = 'docked'
        detectOperationalWear(state, vessel, 'delivery', at)
        // Fault detection may have suspended this delivery in the same step.
        if (!miningEfficiency(vessel)) continue
        const tonnes = vessel.cargo
        vessel.delivered += tonnes
        vessel.cargo = 0
        const startsAt = Math.max(at, ...state.processingQueue.map((load) => load.completesAt))
        if (tonnes > 0) state.processingQueue.push({ id: `${vessel.id}-run-${vessel.run}`, vesselId: vessel.id, tonnes, completesAt: startsAt + PROCESSING_MS })
        routine(state, at, vessel.minerId, 'docking', tonnes > 0 ? `${vessel.name} delivered ${tonnes} tonnes to Processor One.` : `${vessel.name} returned safely. Preparing the next assignment.`, [vessel.id, 'processor-01'], 'Cargo transferred before the next assignment.', 165)
        vessel.miningProgress = 0
        // Advance once at unload, including when the next assignment is held for service.
        if (tonnes > 0) vessel.run++
        // A routine service stop after four runs since the last inspection; no damage is caused by absence.
        if (vessel.routineServiceDue || vessel.runsSinceService >= 4 || activeFaults(vessel).some((f) => f.action !== 'continue')) {
          vessel.routineServiceDue ||= vessel.runsSinceService >= 4
          vessel.resumeAfterRepair ||= activeFaults(vessel).length > 0
          vessel.assignment = 'standby'
          vessel.dockingState = 'docked'
          vessel.completesAt = null
        } else {
          vessel.assignment = 'extraction'
          vessel.dockingState = 'deployed'
          vessel.startedAt = at
          vessel.completesAt = miningEfficiency(vessel) > 0 ? at + extractionDuration(vessel.cut) / miningEfficiency(vessel) : null
        }
      } else {
        vessel.assignment = 'standby'
        vessel.dockingState = 'docked'
        vessel.completesAt = null
        routine(state, at, vessel.minerId, 'docking', `${vessel.name} is secured at Berth Four.`, [vessel.id], 'Standard approach completed safely.', 140)
      }
    }
    scheduleRepairs(state, at)
    dispatchRoutineService(state, at)
    for (const load of state.processingQueue.filter((q) => q.completesAt <= at)) {
      state.oreProcessed += load.tonnes
      routine(state, at, 'ada-sen', 'processing', `Processor One completed a ${load.tonnes} tonne load.`, [load.vesselId, 'processor-01'], 'Queued processing completed normally.')
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
    for (const j of state.repairJobs) if (j.nextAt !== null) j.nextAt += skipped
    for (const v of state.vessels) for (const f of activeFaults(v)) {
      if (f.decisionAt !== null) f.decisionAt += skipped
      if (f.escalatesAt !== null) f.escalatesAt += skipped
    }
    for (const q of state.processingQueue) q.completesAt += skipped
    for (const field of ['berthInspectionAt', 'coolantInspectionAt', 'scannerCalibrationAt'] as const) if (state.systems[field] !== null) state.systems[field] += skipped
  }
  // Calendar age includes the skipped interval; only operational work is bounded.
  state.facilityAgeMs += now - state.lastProcessedAt
  state.lastProcessedAt = now
  updateCrewState(state)
}

export const COMMISSIONING_NOTICE = 'Facility not commissioned. Normal operations have not started, so no operational events are generated. Select Readiness Check to start or resume commissioning, then complete or delegate the checks.'

export function operationalStatus(state: FacilityState): string {
  if (!state.commissioned) return COMMISSIONING_NOTICE
  const active = state.vessels.filter((v) => v.assignment === 'extraction' && v.dockingState === 'deployed').length
  const docked = state.vessels.filter((v) => v.dockingState === 'docked').length
  const moving = state.vessels.filter((v) => ['returning', 'approaching'].includes(v.dockingState))
  const holding = state.vessels.filter((v) => v.dockingState === 'holding')
  const standby = state.vessels.length - active - docked - moving.length - holding.length
  const assigned = state.repairDrones.filter((d) => d.targetId !== null).length
  const available = state.repairDrones.filter((d) => d.state === 'available' && !d.maintenanceDue).length
  const warnings = [state.systems.berth === 'isolated' ? 'Berth Four isolated.' : '', state.systems.coolant === 'inspection' ? 'Coolant inspection in progress.' : '', state.systems.scanner === 'manual-sampling' ? 'Manual sampling active during scanner calibration.' : ''].filter(Boolean)
  const faults = state.vessels.flatMap((v) => activeFaults(v).map((f) => vesselRepairStatus(state, v, f))).join(' ')
  const service = state.vessels.filter((v) => v.routineServiceDue).map((v) => `${v.name}: ${state.repairDrones.some((d) => d.targetId === v.id && d.state === 'servicing' && d.assignedJobId === null) ? 'routine service in progress; work suspended' : 'routine service scheduled after safe cargo delivery'}.`).join(' ')
  const requests = (state.pendingEvent ? 1 : 0) + pendingFaults(state).length
  return `${faults ? `${faults} ` : ''}${service ? `${service} ` : ''}${quantity(active, 'mining vessel')} active. ${docked} docked. ${moving.length} in transit${moving.length ? ` (${moving.map((v) => v.name).join(', ')})` : ''}. ${holding.length} holding${holding.length ? ` (${holding.map((v) => v.name).join(', ')})` : ''}.${standby ? ` ${standby} on standby.` : ''} ${quantity(requests, 'crew request')} awaiting attention. ${quantity(assigned, 'repair drone')} assigned. ${available} available. Processor One has ${quantity(state.processingQueue.length, 'queued load')}. ${warnings.join(' ') || 'No major facility warnings.'} ${requests ? `${quantity(requests, 'decision')} pending.` : 'No decisions pending.'} ${droneStatus(state)}`
}

export function shouldBriefOnReturn(state: FacilityState, since: number, now: number, previousOperationId: number): boolean {
  if (!state.commissioned) return true
  const warnings = state.vessels.some((vessel) => activeFaults(vessel).length > 0)
    || state.repairDrones.some((drone) => drone.maintenanceDue)
    || state.systems.berth === 'isolated' || state.systems.coolant === 'inspection' || state.systems.scanner === 'manual-sampling'
  const meaningfulChange = state.operations.some((entry) => Number(entry.id.replace('op-', '')) >= previousOperationId && entry.category !== 'chatter' && entry.category !== 'command')
  if (warnings || state.pendingEvent || pendingFaults(state).length || meaningfulChange) return true
  // Briefing age does not turn a momentary, unchanged reconnect into an absence.
  if (now - since < 60_000) return false
  if (now - since >= 5 * 60_000) return true
  const last = state.transcript.filter((entry) => entry.text.startsWith('Captain terminal connected.')).at(-1)
  return !last || !last.text.includes(operationalStatus(state))
}

export function absenceReport(event: OperationalEvent): string {
  // Historical requests must not invite a response to an expired decision window.
  const summary = event.summary.replace(/ Press \d[\s\S]*$/, '')
  if (event.resolution === 'pending') return `Request recorded while Captain unavailable. ${summary}`
  if (event.actionRequested && event.resolution === 'autonomous') return `Facility Control resolved the request autonomously while Captain unavailable. ${summary}`
  return summary
}

export function recordAbsenceTranscript(state: FacilityState, previousOperationId: number): void {
  const fresh = state.operations.filter((event) => Number(event.id.replace('op-', '')) >= previousOperationId && event.category !== 'chatter' && event.category !== 'command')
  state.transcript = [...state.transcript, ...fresh.map((event) => ({
    id: `absence-${event.id}`,
    speaker: state.miners.find((miner) => miner.id === event.source)?.callsign ?? 'Facility Control',
    text: `During your absence: ${absenceReport(event)}`,
    timestamp: event.timestamp,
    operationAgeMs: event.operationAgeMs,
    priority: event.category === 'safety' ? 1 as const : 2 as const,
  }))].slice(-80)
}

function longAbsenceSummary(state: FacilityState, since: number, now: number): string {
  const recent = state.operations.filter((event) => event.timestamp > since && event.timestamp <= now && event.category !== 'chatter' && event.category !== 'command')
  const runs = recent.filter((event) => event.operationCode === 112).length
  // Existing saved reports are the durable source for interval totals, including older saves.
  const delivered = recent.filter((event) => event.operationCode === 165).reduce((sum, event) => sum + Number(event.summary.match(/delivered (\d+(?:\.\d+)?) tonnes/)?.[1] ?? 0), 0)
  const processed = recent.filter((event) => event.category === 'processing').reduce((sum, event) => sum + Number(event.summary.match(/completed a (\d+(?:\.\d+)?) tonne load/)?.[1] ?? 0), 0)
  const repairs = new Set(recent.filter((event) => event.operationCode === 245 && event.repair).map((event) => event.repair!.jobId)).size
  const services = recent.filter((event) => event.operationCode === 245 && !event.repair).length
  const faults = new Set(recent.filter((event) => event.repair && event.repair.detectedAt > since).map((event) => event.repair!.faultId)).size
  const critical = new Set(recent.filter((event) => event.repair?.severity === 'critical' && event.repair.detectedAt > since).map((event) => event.repair!.faultId)).size
  const inspections = recent.filter((event) => event.category === 'maintenance' && !event.repair && event.operationCode === undefined && /inspection complete|calibration complete/.test(event.summary)).length
  const decisions = recent.filter((event) => event.actionRequested && event.resolution === 'manual' && !['diagnostics', 'recommend'].includes(event.repair?.action ?? '')).length
  const autonomous = recent.filter((event) => event.actionRequested && event.resolution === 'autonomous' && (!event.repair || event.repair.action !== null)).length
  const requests = pendingFaults(state).length + Number(state.pendingEvent !== null)
  const partial = state.nextOperationId > state.operations.length + 1 && (state.operations[0]?.timestamp ?? 0) > since
  const minutes = Math.floor((now - since) / 60_000)
  return `Captain terminal connected. Elapsed since last connection: ${quantity(Math.floor(minutes / 60), 'hour')} and ${quantity(minutes % 60, 'minute')}. ${now - since > MAX_CATCHUP_MS ? 'Catch-up is limited to seven days of operations. ' : ''}${partial ? 'History retention covers only part of this absence; the following totals cover retained records. ' : 'During your absence: '}${quantity(runs, 'extraction run')} completed; ${delivered} tonnes delivered; ${processed} tonnes processed. ${quantity(repairs, 'corrective repair')} and ${quantity(services, 'routine service')} completed. ${quantity(inspections, 'facility inspection')} completed. ${quantity(faults, 'vessel fault')} reported (${critical} critical); ${quantity(decisions, 'captain decision')}; ${quantity(autonomous, 'autonomous response')}. ${requests ? `${quantity(requests, 'request')} awaiting your decision. ${pendingFaults(state).length ? 'Press 3 for vessel support. ' : ''}${state.pendingEvent ? 'Press 0 for the crew request. ' : ''}` : 'No captain decision is pending. '}Current state: ${operationalStatus(state)} Operational history contains the detailed chronology.`
}

export function returnBriefing(state: FacilityState, since: number, now: number): string {
  if (!state.commissioned) return `Captain terminal connected. ${COMMISSIONING_NOTICE}`
  if (Number.isFinite(since) && now - since >= 30 * 60_000) return longAbsenceSummary(state, since, now)
  const requests = pendingFaults(state)
  const pendingRepair = requests.find(({ fault }) => fault.emergency) ?? requests[0]
  if (pendingRepair) {
    const { vessel, fault } = pendingRepair
    const reporter = fault.type === 'communications-failure' ? 'Telemetry' : state.miners.find((miner) => miner.id === vessel.minerId)?.callsign ?? vessel.name
    return `Captain terminal connected. ${quantity(requests.length, 'service request')} awaiting your decision. ${reporter} reported ${faultLibrary[fault.type].name.toLowerCase()} on ${vessel.name} at ${formatOperationTime(operationAgeAt(state, fault.detectedAt))}. Press 3 for vessel support.${state.pendingEvent ? ' Another crew request is also pending; press 0 to hear it.' : ''}`
  }
  if (state.pendingEvent) return `Captain terminal connected. A crew request is awaiting your decision. Press 0 to hear the request and choices.`

  const elapsed = Number.isFinite(since) ? Math.max(0, now - since) : 0
  const recent = state.operations.filter((event) => event.timestamp > since && event.category !== 'chatter' && event.category !== 'command')
  // Summarize each repair once; the full transit/service sequence belongs in history.
  const completedFaults = new Set(recent.filter((e) => e.operationCode === 245 && e.repair).map((e) => e.repair!.faultId))
  const entries = recent.filter((event, index) => !event.repair || (completedFaults.has(event.repair.faultId)
    ? event.operationCode === 245
    : !recent.slice(index + 1).some((later) => later.repair?.faultId === event.repair!.faultId)))
  const priority = (event: OperationalEvent) => event.operationCode === 245 || event.operationCode === 390 ? -1 : event.category === 'safety' || (event.actionRequested && event.resolution === 'autonomous') ? 0 : event.category === 'maintenance' ? 1 : 2
  const selected = [...entries].sort((a, b) => priority(a) - priority(b) || b.timestamp - a.timestamp).slice(0, 4).sort((a, b) => a.timestamp - b.timestamp)
  const minutes = Math.floor(elapsed / 60_000)
  const duration = minutes >= 60 ? `${quantity(Math.floor(minutes / 60), 'hour')} and ${quantity(minutes % 60, 'minute')}` : minutes === 0 ? 'less than 1 minute' : quantity(minutes, 'minute')
  return `Captain terminal connected. Elapsed since last connection: ${duration}. ${elapsed > MAX_CATCHUP_MS ? 'Catch-up is limited to seven days of operations. ' : ''}${selected.length ? `During your absence: ${selected.map((event) => `${formatOperationTime(event.operationAgeMs)}: ${absenceReport(event)}`).join(' ')}` : 'No significant operational changes during your absence.'} ${recent.some((event) => event.resolution === 'autonomous' && event.reason?.includes('response window elapsed')) ? 'Facility Control resolved requests autonomously while you were unavailable, after their response windows elapsed. ' : ''}No intervention is required. ${operationalStatus(state)} Press 0 for current status. Operational history is available in the terminal.`
}

function dispatchRoutineService(state: FacilityState, at: number): void {
  for (const vessel of state.vessels.filter((v) => v.routineServiceDue && v.assignment === 'standby' && v.dockingState === 'docked' && v.cargo === 0 && activeFaults(v).length === 0)) {
    if (state.repairDrones.some((d) => d.targetId === vessel.id)) continue
    const drone = state.repairDrones.find((d) => d.targetId === null && d.state === 'available' && !d.maintenanceDue)
    if (!drone) continue
    vessel.assignment = 'standby'
    vessel.completesAt = null
    drone.targetId = vessel.id
    drone.state = 'servicing'
    drone.location = vessel.name
    drone.serviceStartedAt = at
    drone.completesAt = at + SERVICE_MS
    routine(state, at, 'facility', 'maintenance', `${drone.id.toUpperCase()} assigned to routine service on ${vessel.name}.`, [drone.id, vessel.id], 'Scheduled service protects equipment before the next run.', 220)
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
