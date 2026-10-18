import { criticalPlaytestEnabled, CRITICAL_PLAYTEST_RUN_INTERVAL, CRITICAL_PLAYTEST_SEQUENCE } from './playtest'
import { quantity } from './text'
import { CAPTAIN_TIMEOUT_MS, PRODUCTION_CYCLE_MS, recordOperation } from './engine'
import { codeReport } from './operations'
import type { FacilityState, FaultType, KeypadKey, RepairAction, RepairJob, Vessel, VesselCondition, VesselFault } from './types'

function elapsedMinutes(value: number): string {
  return quantity(value, 'minute')
}

const MINUTE = 60_000
const TRAVEL_MS = 2 * MINUTE
const DOCKING_MS = MINUTE
const conditions: VesselCondition[] = ['nominal', 'degraded', 'fault', 'critical', 'offline']
export type FaultDefinition = {
  name: string; subsystem: string; severity: VesselCondition; allowsMining: boolean
  efficiency: number; safeResponse: 'drone' | 'dock'; diagnostics: string
  requirements: string; operationCode: number; locations: ('remote-drone' | 'dock')[]; serviceMs: number
}
export const faultLibrary: Record<FaultType, FaultDefinition> = {
  'drill-wear': { name: 'Drill wear', subsystem: 'drill', severity: 'degraded', allowsMining: true, efficiency: 0.8, safeResponse: 'dock', diagnostics: 'Drill teeth are worn. Reduced cutting rate remains safe.', requirements: 'Replace cutting teeth', operationCode: 205, locations: ['remote-drone', 'dock'], serviceMs: 5 * MINUTE },
  'thruster-malfunction': { name: 'Thruster malfunction', subsystem: 'propulsion', severity: 'fault', allowsMining: false, efficiency: 0, safeResponse: 'drone', diagnostics: 'Thruster response is uneven. Low-power return remains possible unless disabled.', requirements: 'Service thruster actuator', operationCode: 205, locations: ['remote-drone', 'dock'], serviceMs: 8 * MINUTE },
  'sensor-degradation': { name: 'Sensor degradation', subsystem: 'sensors', severity: 'degraded', allowsMining: true, efficiency: 0.85, safeResponse: 'drone', diagnostics: 'Dust on the sensor array reduces confidence. Reduced-rate extraction is safe.', requirements: 'Clean and calibrate sensor array', operationCode: 205, locations: ['remote-drone', 'dock'], serviceMs: 4 * MINUTE },
  'hull-damage': { name: 'Hull damage', subsystem: 'hull', severity: 'critical', allowsMining: false, efficiency: 0, safeResponse: 'dock', diagnostics: 'Outer hull damage detected. Crew compartment is secure.', requirements: 'Dockside structural patch and inspection', operationCode: 302, locations: ['dock'], serviceMs: 10 * MINUTE },
  'communications-failure': { name: 'Communications failure', subsystem: 'communications', severity: 'fault', allowsMining: false, efficiency: 0, safeResponse: 'dock', diagnostics: 'Primary antenna is unreliable. Vessel telemetry and the predefined safe-return protocol remain available.', requirements: 'Repair antenna connection', operationCode: 205, locations: ['remote-drone', 'dock'], serviceMs: 5 * MINUTE },
  'cargo-jam': { name: 'Cargo mechanism jam', subsystem: 'cargo', severity: 'fault', allowsMining: false, efficiency: 0, safeResponse: 'dock', diagnostics: 'Cargo latch is jammed. Cargo remains secured; dockside service is required before transfer.', requirements: 'Release and align cargo latch', operationCode: 205, locations: ['dock'], serviceMs: 6 * MINUTE },
  'power-instability': { name: 'Power instability', subsystem: 'power', severity: 'critical', allowsMining: false, efficiency: 0, safeResponse: 'drone', diagnostics: 'Work bus isolated. Independent safety power is stable. Hold position for service.', requirements: 'Replace power regulator', operationCode: 301, locations: ['remote-drone', 'dock'], serviceMs: 7 * MINUTE },
  'navigation-fault': { name: 'Navigation fault', subsystem: 'navigation', severity: 'fault', allowsMining: false, efficiency: 0, safeResponse: 'dock', diagnostics: 'Guidance disagreement detected. Facility beacon supports a slow safe return.', requirements: 'Guidance-array calibration', operationCode: 205, locations: ['remote-drone', 'dock'], serviceMs: 5 * MINUTE },
}
function faultDiagnostics(vessel: Vessel, type: FaultType): string {
  const diagnosis = faultLibrary[type].diagnostics
  if (type !== 'hull-damage') return diagnosis
  return `${diagnosis} Stop work. ${vessel.dockingState === 'docked' ? 'Priority structural inspection and dockside repair required.' : 'Priority return and docking required.'}`
}

export const activeFaults = (v: Vessel) => v.activeFaults.filter((f) => f.resolvedAt === null)
export const activeJob = (state: FacilityState, fault: VesselFault) => state.repairJobs.find((j) => j.faultId === fault.id && j.state !== 'complete')
export const pendingFaults = (state: FacilityState) => state.vessels.flatMap((v) => activeFaults(v).filter((f) => f.decisionAt !== null).map((f) => ({ vessel: v, fault: f })))
export function recalculateCondition(vessel: Vessel): void {
  vessel.condition = activeFaults(vessel).reduce<VesselCondition>((worst, f) => conditions.indexOf(f.severity) > conditions.indexOf(worst) ? f.severity : worst, 'nominal')
}
export function miningEfficiency(vessel: Vessel): number {
  return activeFaults(vessel).reduce((value, f) => Math.min(value, f.severity === 'degraded' && faultLibrary[f.type].allowsMining ? faultLibrary[f.type].efficiency : 0), 1)
}
function canReturn(vessel: Vessel): boolean {
  return !activeFaults(vessel).some((f) => f.severity === 'offline' || f.type === 'power-instability')
}
function log(state: FacilityState, vessel: Vessel, fault: VesselFault, at: number, code: number, text: string, actor = 'facility', action: RepairAction | null = null, reason: string | null = null, job?: RepairJob, before = vessel.condition): string {
  fault.operationCode = code
  const summary = codeReport(code, text)
  recordOperation(state, { timestamp: at, source: actor, category: code >= 300 ? 'safety' : 'maintenance', summary, relatedIds: [vessel.id, fault.id, ...(job?.assignedDroneId ? [job.assignedDroneId] : [])], actionRequested: fault.decisionAt !== null || action !== null, resolution: actor === 'captain' ? 'manual' : fault.decisionAt !== null ? 'pending' : 'autonomous', reason,
    operationCode: code, repair: { vesselId: vessel.id, faultId: fault.id, faultType: fault.type, subsystem: faultLibrary[fault.type].subsystem, severity: fault.severity, conditionBefore: before, conditionAfter: vessel.condition, detectedAt: fault.detectedAt, actor, action, droneId: job?.assignedDroneId ?? null, jobId: job?.id ?? null, serviceStartedAt: job?.serviceStartedAt ?? null, completedAt: job?.completedAt ?? null, outcome: job?.outcome ?? null, availability: vessel.assignment === 'extraction' ? 'working' : activeFaults(vessel).length || vessel.routineServiceDue ? 'unavailable' : 'available' } })
  return summary
}
function hold(vessel: Vessel): void {
  vessel.resumeAfterRepair ||= vessel.assignment === 'extraction' || vessel.assignment === 'delivery'
  vessel.assignment = 'standby'
  if (vessel.dockingState !== 'docked') vessel.dockingState = 'holding'
  vessel.completesAt = null
}

/** Explicit incident input is also the deterministic playtest seam. */
export function detectFault(state: FacilityState, vesselId: string, type: FaultType, at: number): VesselFault | null {
  const vessel = state.vessels.find((v) => v.id === vesselId)
  if (!vessel || activeFaults(vessel).some((f) => f.type === type)) return null
  const definition = faultLibrary[type]
  const before = vessel.condition
  const previousEfficiency = miningEfficiency(vessel)
  const fault: VesselFault = { id: `fault-${state.nextRepairId++}`, type, severity: definition.severity, detectedAt: at, decisionAt: definition.severity === 'critical' ? null : at + CAPTAIN_TIMEOUT_MS, escalatesAt: null, resolvedAt: null, action: null, operationCode: 205, emergency: definition.severity === 'critical' }
  vessel.activeFaults.push(fault)
  recalculateCondition(vessel)
  if (!miningEfficiency(vessel)) hold(vessel)
  else if (vessel.assignment === 'extraction' && vessel.completesAt !== null) {
    vessel.completesAt = at + Math.max(0, vessel.completesAt - at) * previousEfficiency / miningEfficiency(vessel)
  }
  if (fault.severity === 'degraded' && ['extraction', 'delivery'].includes(vessel.assignment)) fault.escalatesAt = at + 30 * MINUTE
  const requester = type === 'communications-failure' ? undefined : state.miners.find((miner) => miner.id === vessel.minerId)
  const report = requester ? `Control, ${requester.callsign} ${fault.emergency ? 'reporting a critical fault on' : 'requesting service for'} ${vessel.name}.` : `${vessel.name}: telemetry reports a service requirement.`
  const response = fault.emergency
    ? 'Facility Control is initiating the predefined safe response immediately. No Captain decision is required to begin safety handling. Press 3 for diagnostics and status; 1 for urgent incident status.'
    : 'Press 3 for vessel support; 1 for urgent incidents.'
  log(state, vessel, fault, at, definition.operationCode, `${report} ${definition.name}. Condition ${vessel.condition.toUpperCase()}. ${faultDiagnostics(vessel, type)} ${response}`, requester?.id ?? 'facility', null, 'Equipment reports an operational fault; unsafe work is suspended immediately.', undefined, before)
  if (fault.emergency) decideRepair(state, vessel, fault, recommendation(state, vessel, fault).action, at, 'facility')
  return fault
}

export function escalateFault(state: FacilityState, vessel: Vessel, fault: VesselFault, at: number, disabled = false): void {
  if (fault.resolvedAt !== null) return
  const before = vessel.condition
  fault.severity = disabled ? 'offline' : 'fault'
  fault.emergency ||= disabled
  fault.escalatesAt = null
  fault.decisionAt = activeJob(state, fault) ? null : at + CAPTAIN_TIMEOUT_MS
  recalculateCondition(vessel)
  hold(vessel)
  log(state, vessel, fault, at, disabled ? 315 : 210, `${vessel.name}: ${faultLibrary[fault.type].name}. Condition ${vessel.condition.toUpperCase()}. ${disabled ? 'Propulsion is unavailable. Vessel holding safely for recovery.' : 'Continued operation reached the service limit. Mining suspended.'}`, 'facility', null, 'Work stopped to preserve crew and equipment.', undefined, before)
}

export function recommendation(state: FacilityState, vessel: Vessel, fault: VesselFault): { action: RepairAction; text: string } {
  const definition = faultLibrary[fault.type]
  const existing = activeJob(state, fault)
  if (existing) return { action: 'recommend', text: `${vessel.name} already has ${existing.method === 'dock' ? 'dock service' : 'drone support'} ${existing.state.replaceAll('-', ' ')}. Keep the safe hold; assigned work will continue. ${existing.state === 'waiting' ? 'Resources are reserved only when available.' : ''}` }
  const drone = state.repairDrones.find((d) => d.state === 'available' && d.targetId === null && !d.maintenanceDue)
  const remote = definition.locations.includes('remote-drone')
  const berth = state.systems.berth !== 'open' ? 'Berth Four is isolated; dock service will wait for inspection' : state.repairJobs.some((j) => j.method === 'dock' && ['servicing', 'docking'].includes(j.state)) ? 'Berth Four has a service assignment; further dock repairs will queue' : 'Berth Four is open'
  if (vessel.dockingState === 'docked') return { action: 'dock', text: `${berth}. Recommend dock repair; ${definition.requirements.toLowerCase()}.` }
  if (!canReturn(vessel) || (remote && drone && definition.safeResponse === 'drone')) return { action: 'drone', text: `${drone ? `${drone.name} is available. Transit is two minutes` : 'No repair drone is available; current assignments must finish'}. Recommend safe hold and ${remote ? 'remote service' : 'drone-assisted recovery to dock'}. ${berth}.` }
  return { action: 'dock', text: `${drone ? `${drone.name} is available` : 'No repair drone is available'}. Beacon-guided return is possible, two minutes to approach. ${berth}. Recommend safe return for dock repair.` }
}

export function repairOptions(state: FacilityState, vessel: Vessel, fault: VesselFault): Partial<Record<KeypadKey, { action: RepairAction; label: string }>> {
  const options: ReturnType<typeof repairOptions> = { '1': { action: 'diagnostics', label: 'Diagnostics' }, '8': { action: 'recommend', label: 'Facility recommendation' } }
  if (activeJob(state, fault)) return options
  if (vessel.dockingState !== 'docked') {
    const vesselBusy = state.repairJobs.some((job) => job.vesselId === vessel.id && job.state !== 'complete' && job.state !== 'waiting')
    const available = !vesselBusy && state.repairDrones.some((d) => d.state === 'available' && d.targetId === null && !d.maintenanceDue)
    const remote = faultLibrary[fault.type].locations.includes('remote-drone')
    options['2'] = { action: 'drone', label: !available ? 'Queue drone support' : remote ? 'Dispatch repair drone' : 'Drone recovery to dock' }
  }
  if (vessel.dockingState === 'docked' || canReturn(vessel)) {
    options['3'] = { action: 'dock', label: 'Dock repair' }
    if (vessel.dockingState !== 'docked') options['4'] = { action: 'safe-return', label: 'Safe return' }
  }
  if (miningEfficiency(vessel) > 0 && ['deployed', 'returning'].includes(vessel.dockingState)) options['5'] = { action: 'continue', label: 'Continue carefully' }
  options['6'] = { action: 'stop', label: 'Stop work; await safe recovery' }
  options['7'] = { action: 'crew', label: 'Let crew decide' }
  return options
}

export function vesselRepairStatus(state: FacilityState, vessel: Vessel, fault: VesselFault): string {
  const job = activeJob(state, fault)
  return codeReport(fault.operationCode, `${vessel.name}. ${faultLibrary[fault.type].name}. Condition ${vessel.condition.toUpperCase()}. ${job ? `${job.method === 'dock' ? 'Dock repair' : 'Drone support'} ${job.state.replaceAll('-', ' ')}.` : fault.action === 'continue' ? 'Continuing carefully at reduced capacity.' : 'Safe response available.'}`)
}
export function repairMenu(state: FacilityState, vessel: Vessel, fault: VesselFault): string {
  return `${vesselRepairStatus(state, vessel, fault)} ${Object.entries(repairOptions(state, vessel, fault)).map(([key, option]) => `Press ${key} for ${option.label.toLowerCase()}.`).join(' ')} Press # for next vessel fault. Star returns to the main terminal.`
}
export function droneStatus(state: FacilityState): string {
  return state.repairDrones.map((d) => `${d.name}: ${d.state.replaceAll('-', ' ')} at ${d.location}. ${d.targetId ? `Assigned to ${state.vessels.find((v) => v.id === d.targetId)?.name ?? d.targetId}.` : ''} ${d.maintenanceDue ? 'Maintenance required before reuse.' : 'Maintenance current.'}`).join(' ')
}

export function decideRepair(state: FacilityState, vessel: Vessel, fault: VesselFault, action: RepairAction, at: number, actor = 'captain'): string {
  if (fault.resolvedAt !== null) return `${vessel.name}: service already complete.`
  if (fault.decisionAt !== null && at >= fault.decisionAt && actor === 'captain') return decideRepair(state, vessel, fault, 'crew', at, 'facility')
  if (action === 'diagnostics') return log(state, vessel, fault, at, 201, `${vessel.name}. ${faultDiagnostics(vessel, fault.type)} Required: ${faultLibrary[fault.type].requirements}.`, actor, action)
  if (action === 'recommend') return recommendation(state, vessel, fault).text
  if (activeJob(state, fault)) return vesselRepairStatus(state, vessel, fault)
  if (action === 'continue' && (miningEfficiency(vessel) === 0 || !['deployed', 'returning'].includes(vessel.dockingState))) return 'Continued work is not safe. Request the Facility recommendation.'
  if ((action === 'dock' || action === 'safe-return') && vessel.dockingState !== 'docked' && !canReturn(vessel)) return 'Self-powered return is unavailable. Request drone recovery.'
  const reason = action === 'crew' ? `${actor === 'facility' ? 'The response window elapsed. ' : 'Captain delegated the decision. '}${recommendation(state, vessel, fault).text}` : actor === 'facility' ? 'CRITICAL condition: Facility Control initiated the predefined safe response immediately.' : 'Captain selected the operational response.'
  if (action === 'crew') { action = recommendation(state, vessel, fault).action; actor = 'facility' }
  fault.action = action
  fault.decisionAt = null
  if (action === 'continue') return log(state, vessel, fault, at, 210, `Confirmed. ${vessel.name} continuing carefully. Reduced capability; service limit remains monitored.`, actor, action, reason)
  if (action === 'stop') {
    hold(vessel)
    fault.escalatesAt = null
    // A safe hold is a real choice, but cannot strand unattended work indefinitely.
    fault.decisionAt = at + CAPTAIN_TIMEOUT_MS
    return log(state, vessel, fault, at, 180, `Confirmed. ${vessel.name} stopped safely. Facility Control will arrange recovery after the response window.`, actor, action, reason)
  }
  const location = vessel.dockingState
  hold(vessel)
  fault.escalatesAt = null
  const method = action === 'drone' && vessel.dockingState !== 'docked' ? 'remote-drone' : 'dock'
  if (location === 'approaching' && method === 'dock') vessel.dockingState = location
  const job: RepairJob = { id: `repair-${state.nextRepairId++}`, vesselId: vessel.id, faultId: fault.id, method, assignedDroneId: null, state: 'waiting', createdAt: at, dispatchedAt: null, serviceStartedAt: null, completedAt: null, nextAt: null, outcome: null }
  state.repairJobs.push(job)
  const message = log(state, vessel, fault, at, method === 'dock' ? 235 : 215, `${vessel.name}: ${method === 'dock' ? 'dock service authorized' : 'drone support requested; holding safely pending assignment and dispatch'}. ${reason}`, actor, action, reason, job)
  scheduleRepairs(state, at)
  const status = vesselRepairStatus(state, vessel, fault)
  if (job.assignedDroneId) {
    const drone = state.repairDrones.find((d) => d.id === job.assignedDroneId)!
    return `Confirmed. ${drone.name} assigned to ${vessel.name}. ${status} ${reason}`
  }
  return `${message} ${status}`
}

function startReturn(state: FacilityState, job: RepairJob, vessel: Vessel, fault: VesselFault, at: number): void {
  job.state = 'returning-vessel'
  job.nextAt = at + TRAVEL_MS
  vessel.dockingState = 'returning'
  const drone = state.repairDrones.find((d) => d.id === job.assignedDroneId)
  if (drone) { drone.state = 'in-transit'; drone.location = `recovering ${vessel.name} to facility`; drone.transitStartedAt = at }
  log(state, vessel, fault, at, 240, `${vessel.name} returning for dock service. ${job.assignedDroneId ? 'Repair drone providing recovery guidance and tow.' : 'Beacon-guided return authorized.'}`, 'facility', null, 'Return before resuming work.', job)
}

function priority(state: FacilityState, job: RepairJob): number {
  return Number(state.vessels.find((v) => v.id === job.vesselId)!.activeFaults.find((f) => f.id === job.faultId)!.emergency)
}

export function scheduleRepairs(state: FacilityState, at: number): void {
  for (const job of state.repairJobs.filter((j) => j.state === 'waiting').sort((a, b) => priority(state, b) - priority(state, a))) {
    const vessel = state.vessels.find((v) => v.id === job.vesselId)!
    const fault = vessel.activeFaults.find((f) => f.id === job.faultId)!
    // One vessel cannot be moved by two concurrent jobs.
    if (state.repairJobs.some((j) => j.id !== job.id && j.vesselId === vessel.id && j.state !== 'complete' && j.state !== 'waiting')) continue
    if (job.method === 'remote-drone') {
      const drone = state.repairDrones.find((d) => d.state === 'available' && !d.maintenanceDue && d.targetId === null)
      if (!drone) continue
      drone.targetId = vessel.id
      drone.assignedJobId = job.id
      drone.state = 'dispatched'
      job.assignedDroneId = drone.id
      job.dispatchedAt = at
      job.state = 'dispatched'
      job.nextAt = at + 1_000
      log(state, vessel, fault, at, 220, `${drone.name} assigned to ${vessel.name}.`, 'facility', null, 'Drone reserved until return and required maintenance are complete.', job)
    } else {
      // Another simultaneous fault may have removed self-return capability.
      if (vessel.dockingState !== 'docked' && !canReturn(vessel)) { job.method = 'remote-drone'; scheduleRepairs(state, at); continue }
      if (vessel.dockingState === 'docked') {
        if (state.systems.berth === 'open' && !state.repairJobs.some((other) => other.id !== job.id && other.method === 'dock' && other.state === 'servicing')) startService(state, job, vessel, fault, at)
      } else if (vessel.dockingState === 'approaching') {
        job.state = 'docking'; job.nextAt = at + DOCKING_MS
      } else startReturn(state, job, vessel, fault, at)
    }
  }
}
function startService(state: FacilityState, job: RepairJob, vessel: Vessel, fault: VesselFault, at: number): void {
  job.state = 'servicing'
  job.serviceStartedAt = at
  job.nextAt = at + faultLibrary[fault.type].serviceMs
  const drone = state.repairDrones.find((d) => d.id === job.assignedDroneId)
  if (drone) { drone.state = 'servicing'; drone.location = vessel.name; drone.serviceStartedAt = at }
  log(state, vessel, fault, at, 230, `${vessel.name}: ${faultLibrary[fault.type].requirements}. Service time ${elapsedMinutes(faultLibrary[fault.type].serviceMs / MINUTE)}.`, 'facility', null, 'Service began at the assigned location.', job)
}
export function repairDeadlines(state: FacilityState): number[] {
  return [...state.repairJobs.map((j) => j.nextAt ?? Infinity), ...state.vessels.flatMap((v) => activeFaults(v).flatMap((f) => [f.decisionAt ?? Infinity, f.escalatesAt ?? Infinity]))]
}
export function advanceRepairs(state: FacilityState, at: number): void {
  for (const vessel of state.vessels) for (const fault of activeFaults(vessel)) {
    if (fault.severity === 'critical' && !activeJob(state, fault)) decideRepair(state, vessel, fault, recommendation(state, vessel, fault).action, at, 'facility')
    if (fault.escalatesAt !== null && fault.escalatesAt <= at) escalateFault(state, vessel, fault, at)
    if (fault.decisionAt !== null && fault.decisionAt <= at) decideRepair(state, vessel, fault, 'crew', at, 'facility')
  }
  for (const job of [...state.repairJobs].sort((a, b) => priority(state, b) - priority(state, a))) {
    if (job.nextAt === null || job.nextAt > at) continue
    const vessel = state.vessels.find((v) => v.id === job.vesselId)!
    const fault = vessel.activeFaults.find((f) => f.id === job.faultId)!
    const drone = state.repairDrones.find((d) => d.id === job.assignedDroneId)
    if (job.state === 'dispatched') {
      job.state = 'in-transit'; job.nextAt = at + TRAVEL_MS
      if (drone) { drone.state = 'in-transit'; drone.transitStartedAt = at; drone.location = 'transit to vessel' }
      log(state, vessel, fault, at, 225, `${drone?.name} dispatched to ${vessel.name}. Arrival in two minutes.`, 'facility', null, 'Reserved drone launched.', job)
    } else if (job.state === 'in-transit') {
      if (!faultLibrary[fault.type].locations.includes('remote-drone')) {
        job.method = 'dock'
        log(state, vessel, fault, at, 235, `${vessel.name}: dockside repair required after drone recovery.`, 'facility', null, 'This subsystem requires dockside service.', job)
        startReturn(state, job, vessel, fault, at)
      } else startService(state, job, vessel, fault, at)
    } else if (job.state === 'returning-vessel') {
      // Older saves may contain a confirmation leg for an already-docked vessel.
      if (vessel.dockingState === 'docked') { job.state = 'waiting'; job.nextAt = null }
      else {
        vessel.dockingState = 'approaching'
        job.state = 'docking'; job.nextAt = at + DOCKING_MS
        log(state, vessel, fault, at, 125, `${vessel.name} approaching Berth Four for service.`, 'facility', null, 'Approach remains subject to berth clearance.', job)
      }
    } else if (job.state === 'docking') {
      if (state.systems.berth !== 'open' || state.repairJobs.some((j) => j.id !== job.id && j.method === 'dock' && j.state === 'servicing')) {
        if (vessel.dockingState !== 'docked') vessel.dockingState = 'holding'
        job.nextAt = Math.max(at + MINUTE, state.systems.berthInspectionAt ?? 0)
      } else {
        if (vessel.dockingState !== 'docked') {
          vessel.dockingState = 'docked'
          log(state, vessel, fault, at, 140, `${vessel.name} docked safely for service.`, 'facility', null, 'Berth cleared and vessel secured.', job)
        }
        startService(state, job, vessel, fault, at)
      }
    } else if (job.state === 'servicing') {
      const before = vessel.condition
      job.state = 'complete'; job.nextAt = null; job.completedAt = at; job.outcome = 'restored'
      fault.resolvedAt = at; fault.decisionAt = null; fault.escalatesAt = null
      vessel.serviceHistory = [...vessel.serviceHistory, job.id].slice(-100)
      vessel.runsSinceService = 0
      vessel.routineServiceDue = false
      recalculateCondition(vessel)
      if (drone) {
        drone.state = 'returning'; drone.location = 'return transit'; drone.transitStartedAt = at
        drone.completesAt = at + TRAVEL_MS
        drone.serviceHistory = [...drone.serviceHistory, job.id].slice(-100)
        drone.maintenanceDue = drone.serviceHistory.length % 4 === 0
      }
      log(state, vessel, fault, at, 245, `${vessel.name}: ${faultLibrary[fault.type].name} repaired${drone ? ` by ${drone.name}` : ' by dockside crew'} in ${elapsedMinutes((at - job.serviceStartedAt!) / MINUTE)}. Condition ${vessel.condition.toUpperCase()}. ${activeFaults(vessel).length ? 'Further faults remain.' : fault.emergency ? 'Emergency recovery complete.' : 'Service complete.'}`, 'facility', null, 'Inspection confirmed this subsystem restored.', job, before)
      // 390 closes all emergency recovery on this vessel: CRITICAL or disabled/OFFLINE.
      if (fault.emergency && !activeFaults(vessel).some((f) => f.emergency)) log(state, vessel, fault, at, 390, `${vessel.name}: emergency recovery complete. Crew and vessel secure.`, 'facility', null, 'All emergency faults resolved.', job, before)
      if (!activeFaults(vessel).length && vessel.resumeAfterRepair) {
        vessel.resumeAfterRepair = false
        vessel.startedAt = at
        if (vessel.cargo > 0) {
          // Corrective inspection reset routine service; retained cargo still needs unloading.
          vessel.assignment = 'delivery'; vessel.completesAt = at + TRAVEL_MS
          if (vessel.dockingState !== 'docked') vessel.dockingState = 'returning'
        } else {
          const remote = vessel.dockingState !== 'docked'
          vessel.assignment = 'extraction'; vessel.dockingState = 'deployed'
          vessel.miningProgress = 0
          vessel.completesAt = at + PRODUCTION_CYCLE_MS + (vessel.cut === 'dense' ? 5 * MINUTE : 0)
          log(state, vessel, fault, at, 101, `${vessel.name}: ${remote ? 'extraction resumed at the remote work site; no vessel return was required' : 'redeployed for extraction after dock service'}.`, 'facility', null, 'Fault service completed before productive work resumed.', job)
        }
      }
    }
  }
  for (const drone of state.repairDrones) {
    if (!['returning', 'maintenance'].includes(drone.state) || drone.completesAt === null || drone.completesAt > at) continue
    drone.location = 'facility'
    const job = state.repairJobs.find((j) => j.id === drone.assignedJobId)
    const vessel = state.vessels.find((v) => v.id === job?.vesselId)
    const fault = vessel?.activeFaults.find((f) => f.id === job?.faultId)
    if (job && vessel && fault) log(state, vessel, fault, at, drone.state === 'returning' && drone.maintenanceDue ? 210 : 290, `${drone.name} ${drone.state === 'returning' && drone.maintenanceDue ? 'returned; three-minute maintenance inspection started' : 'returned to availability'}.`, 'facility', null, 'Drone turnaround completed before reuse.', job)
    if (drone.state === 'returning' && drone.maintenanceDue) {
      drone.state = 'maintenance'; drone.completesAt = at + 3 * MINUTE
    } else {
      drone.state = 'available'; drone.targetId = null; drone.assignedJobId = null; drone.completesAt = null; drone.maintenanceDue = false
    }
  }
  scheduleRepairs(state, at)
  // Keep active records and a bounded completed service archive.
  const completed = state.repairJobs.filter((j) => j.state === 'complete').slice(-100)
  state.repairJobs = state.repairJobs.filter((j) => j.state !== 'complete' || completed.includes(j))
  for (const vessel of state.vessels) vessel.activeFaults = vessel.activeFaults.filter((f) => f.resolvedAt === null || state.repairJobs.some((j) => j.faultId === f.id))
}

/** Restrained wear: successful shifts dominate; triggers are tied to completed work. */
export function detectOperationalWear(state: FacilityState, vessel: Vessel, context: 'extraction' | 'delivery', at: number): void {
  if (context === 'extraction') vessel.operatingRuns++
  if (activeFaults(vessel).length || vessel.lastFaultRun === vessel.operatingRuns) return
  const playtest = criticalPlaytestEnabled()
  if (playtest ? vessel.operatingRuns < CRITICAL_PLAYTEST_RUN_INTERVAL || vessel.operatingRuns % CRITICAL_PLAYTEST_RUN_INTERVAL !== 0 : vessel.operatingRuns % 12 !== 1 || vessel.operatingRuns < 13) return
  const sequence: FaultType[] = ['drill-wear', 'thruster-malfunction', 'sensor-degradation', 'hull-damage', 'communications-failure', 'cargo-jam', 'power-instability', 'navigation-fault']
  const type = playtest ? CRITICAL_PLAYTEST_SEQUENCE[(vessel.operatingRuns / CRITICAL_PLAYTEST_RUN_INTERVAL - 1) % CRITICAL_PLAYTEST_SEQUENCE.length]! : sequence[(Math.floor(vessel.operatingRuns / 12) - 1) % sequence.length]!
  const atDock = type === 'hull-damage' || type === 'cargo-jam'
  if ((context === 'delivery') !== atDock) return
  vessel.lastFaultRun = vessel.operatingRuns
  const fault = detectFault(state, vessel.id, type, at)
  if (fault && type === 'thruster-malfunction' && vessel.operatingRuns > 96) escalateFault(state, vessel, fault, at, true)
}
