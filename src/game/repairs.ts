import { CAPTAIN_TIMEOUT_MS, recordOperation } from './engine'
import { codeReport } from './operations'
import type { FacilityState, FaultType, KeypadKey, RepairAction, RepairJob, Vessel, VesselCondition, VesselFault } from './types'

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
  'hull-damage': { name: 'Hull damage', subsystem: 'hull', severity: 'critical', allowsMining: false, efficiency: 0, safeResponse: 'dock', diagnostics: 'Outer hull damage detected. Crew compartment is secure. Stop work and request priority docking.', requirements: 'Dockside structural patch and inspection', operationCode: 302, locations: ['dock'], serviceMs: 10 * MINUTE },
  'communications-failure': { name: 'Communications failure', subsystem: 'communications', severity: 'fault', allowsMining: false, efficiency: 0, safeResponse: 'dock', diagnostics: 'Primary antenna is unreliable. Vessel telemetry and the predefined safe-return protocol remain available.', requirements: 'Repair antenna connection', operationCode: 205, locations: ['remote-drone', 'dock'], serviceMs: 5 * MINUTE },
  'cargo-jam': { name: 'Cargo mechanism jam', subsystem: 'cargo', severity: 'fault', allowsMining: false, efficiency: 0, safeResponse: 'dock', diagnostics: 'Cargo latch is jammed. Cargo remains secured; dockside service is required before transfer.', requirements: 'Release and align cargo latch', operationCode: 205, locations: ['dock'], serviceMs: 6 * MINUTE },
  'power-instability': { name: 'Power instability', subsystem: 'power', severity: 'critical', allowsMining: false, efficiency: 0, safeResponse: 'drone', diagnostics: 'Work bus isolated. Independent safety power is stable. Hold position for service.', requirements: 'Replace power regulator', operationCode: 301, locations: ['remote-drone', 'dock'], serviceMs: 7 * MINUTE },
  'navigation-fault': { name: 'Navigation fault', subsystem: 'navigation', severity: 'fault', allowsMining: false, efficiency: 0, safeResponse: 'dock', diagnostics: 'Guidance disagreement detected. Facility beacon supports a slow safe return.', requirements: 'Guidance-array calibration', operationCode: 205, locations: ['remote-drone', 'dock'], serviceMs: 5 * MINUTE },
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
  const fault: VesselFault = { id: `fault-${state.nextRepairId++}`, type, severity: definition.severity, detectedAt: at, decisionAt: at + CAPTAIN_TIMEOUT_MS, escalatesAt: null, resolvedAt: null, action: null, operationCode: 205, emergency: definition.severity === 'critical' }
  vessel.activeFaults.push(fault)
  recalculateCondition(vessel)
  if (!miningEfficiency(vessel)) hold(vessel)
  else if (vessel.assignment === 'extraction' && vessel.completesAt !== null) {
    vessel.completesAt = at + Math.max(0, vessel.completesAt - at) * previousEfficiency / miningEfficiency(vessel)
  }
  if (fault.severity === 'degraded' && ['extraction', 'delivery'].includes(vessel.assignment)) fault.escalatesAt = at + 30 * MINUTE
  log(state, vessel, fault, at, definition.operationCode, `${vessel.name}: ${definition.name}. Condition ${vessel.condition.toUpperCase()}. ${definition.diagnostics} Press 3 for vessel support; 1 for urgent incidents.`, 'facility', null, 'Equipment reports an operational fault; unsafe work is suspended immediately.', undefined, before)
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
  if (vessel.dockingState !== 'docked') options['2'] = { action: 'drone', label: canReturn(vessel) && !faultLibrary[fault.type].locations.includes('remote-drone') ? 'Drone recovery to dock' : 'Dispatch repair drone' }
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
  if (action === 'diagnostics') return log(state, vessel, fault, at, 201, `${vessel.name}. ${faultLibrary[fault.type].diagnostics} Required: ${faultLibrary[fault.type].requirements}.`, actor, action)
  if (action === 'recommend') return recommendation(state, vessel, fault).text
  if (activeJob(state, fault)) return vesselRepairStatus(state, vessel, fault)
  if (action === 'continue' && (miningEfficiency(vessel) === 0 || !['deployed', 'returning'].includes(vessel.dockingState))) return 'Continued work is not safe. Request the Facility recommendation.'
  if ((action === 'dock' || action === 'safe-return') && vessel.dockingState !== 'docked' && !canReturn(vessel)) return 'Self-powered return is unavailable. Request drone recovery.'
  const reason = action === 'crew' ? `${actor === 'facility' ? 'The response window elapsed. ' : 'Captain delegated the decision. '}${recommendation(state, vessel, fault).text}` : 'Captain selected the operational response.'
  if (action === 'crew') { action = recommendation(state, vessel, fault).action; actor = 'facility' }
  fault.action = action
  fault.decisionAt = null
  if (action === 'continue') return log(state, vessel, fault, at, 210, `${vessel.name} continuing carefully. Reduced capability; service limit remains monitored.`, actor, action, reason)
  if (action === 'stop') {
    hold(vessel)
    fault.escalatesAt = null
    // A safe hold is a real choice, but cannot strand unattended work indefinitely.
    fault.decisionAt = at + CAPTAIN_TIMEOUT_MS
    return log(state, vessel, fault, at, 180, `${vessel.name} stopped safely. Facility Control will arrange recovery after the response window.`, actor, action, reason)
  }
  hold(vessel)
  fault.escalatesAt = null
  const method = action === 'drone' && vessel.dockingState !== 'docked' ? 'remote-drone' : 'dock'
  const job: RepairJob = { id: `repair-${state.nextRepairId++}`, vesselId: vessel.id, faultId: fault.id, method, assignedDroneId: null, state: 'waiting', createdAt: at, dispatchedAt: null, serviceStartedAt: null, completedAt: null, nextAt: null, outcome: null }
  state.repairJobs.push(job)
  const message = log(state, vessel, fault, at, method === 'dock' ? 235 : 215, `${vessel.name}: ${method === 'dock' ? 'safe return and dock service authorized' : 'drone support requested; holding safely until a drone is free'}. ${reason}`, actor, action, reason, job)
  scheduleRepairs(state, at)
  return `${message} ${vesselRepairStatus(state, vessel, fault)}`
}

function startReturn(state: FacilityState, job: RepairJob, vessel: Vessel, fault: VesselFault, at: number): void {
  job.state = 'returning-vessel'
  job.nextAt = at + TRAVEL_MS
  vessel.dockingState = 'returning'
  const drone = state.repairDrones.find((d) => d.id === job.assignedDroneId)
  if (drone) { drone.state = 'in-transit'; drone.location = `recovering ${vessel.name} to facility`; drone.transitStartedAt = at }
  log(state, vessel, fault, at, fault.emergency ? 325 : 240, `${vessel.name} returning for dock service. ${job.assignedDroneId ? 'Repair drone providing recovery guidance and tow.' : 'Beacon-guided return authorized.'}`, 'facility', null, 'Return before resuming work.', job)
}

export function scheduleRepairs(state: FacilityState, at: number): void {
  for (const job of state.repairJobs.filter((j) => j.state === 'waiting')) {
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
    } else if (vessel.dockingState !== 'docked') {
      // Another simultaneous fault may have removed self-return capability.
      if (!canReturn(vessel)) { job.method = 'remote-drone'; scheduleRepairs(state, at); continue }
      startReturn(state, job, vessel, fault, at)
    } else if (state.systems.berth === 'open' && !state.repairJobs.some((j) => j.id !== job.id && j.method === 'dock' && ['servicing', 'docking'].includes(j.state))) {
      startService(state, job, vessel, fault, at)
    }
  }
}
function startService(state: FacilityState, job: RepairJob, vessel: Vessel, fault: VesselFault, at: number): void {
  job.state = 'servicing'
  job.serviceStartedAt = at
  job.nextAt = at + faultLibrary[fault.type].serviceMs
  const drone = state.repairDrones.find((d) => d.id === job.assignedDroneId)
  if (drone) { drone.state = 'servicing'; drone.location = vessel.name; drone.serviceStartedAt = at }
  log(state, vessel, fault, at, 230, `${vessel.name}: ${faultLibrary[fault.type].requirements}. Service time ${faultLibrary[fault.type].serviceMs / MINUTE} minutes.`, 'facility', null, 'Service began at the assigned location.', job)
}
export function repairDeadlines(state: FacilityState): number[] {
  return [...state.repairJobs.map((j) => j.nextAt ?? Infinity), ...state.vessels.flatMap((v) => activeFaults(v).flatMap((f) => [f.decisionAt ?? Infinity, f.escalatesAt ?? Infinity]))]
}
export function advanceRepairs(state: FacilityState, at: number): void {
  for (const vessel of state.vessels) for (const fault of activeFaults(vessel)) {
    if (fault.escalatesAt !== null && fault.escalatesAt <= at) escalateFault(state, vessel, fault, at)
    if (fault.decisionAt !== null && fault.decisionAt <= at) decideRepair(state, vessel, fault, 'crew', at, 'facility')
  }
  for (const job of state.repairJobs) {
    if (job.nextAt === null || job.nextAt > at) continue
    const vessel = state.vessels.find((v) => v.id === job.vesselId)!
    const fault = vessel.activeFaults.find((f) => f.id === job.faultId)!
    const drone = state.repairDrones.find((d) => d.id === job.assignedDroneId)
    if (job.state === 'dispatched') {
      job.state = 'in-transit'; job.nextAt = at + TRAVEL_MS
      if (drone) { drone.state = 'in-transit'; drone.transitStartedAt = at; drone.location = 'transit to vessel' }
      log(state, vessel, fault, at, 225, `${drone?.name} dispatched to ${vessel.name}. Arrival in two minutes.`, 'facility', null, 'Reserved drone launched.', job)
    } else if (job.state === 'in-transit') {
      if (!faultLibrary[fault.type].locations.includes('remote-drone')) { job.method = 'dock'; startReturn(state, job, vessel, fault, at) }
      else startService(state, job, vessel, fault, at)
    } else if (job.state === 'returning-vessel') {
      vessel.dockingState = 'approaching'
      job.state = 'docking'; job.nextAt = at + DOCKING_MS
      log(state, vessel, fault, at, 125, `${vessel.name} approaching Berth Four for service.`, 'facility', null, 'Approach remains subject to berth clearance.', job)
    } else if (job.state === 'docking') {
      if (state.systems.berth !== 'open' || state.repairJobs.some((j) => j.id !== job.id && j.method === 'dock' && j.state === 'servicing')) {
        vessel.dockingState = 'holding'
        job.nextAt = Math.max(at + MINUTE, state.systems.berthInspectionAt ?? 0)
      } else {
        vessel.dockingState = 'docked'
        log(state, vessel, fault, at, 140, `${vessel.name} docked safely for service.`, 'facility', null, 'Berth cleared and vessel secured.', job)
        startService(state, job, vessel, fault, at)
      }
    } else if (job.state === 'servicing') {
      const before = vessel.condition
      job.state = 'complete'; job.nextAt = null; job.completedAt = at; job.outcome = 'restored'
      fault.resolvedAt = at; fault.decisionAt = null; fault.escalatesAt = null
      vessel.serviceHistory = [...vessel.serviceHistory, job.id].slice(-100)
      recalculateCondition(vessel)
      if (drone) {
        drone.state = 'returning'; drone.location = 'return transit'; drone.transitStartedAt = at
        drone.completesAt = at + TRAVEL_MS
        drone.serviceHistory = [...drone.serviceHistory, job.id].slice(-100)
        drone.maintenanceDue = drone.serviceHistory.length % 4 === 0
      }
      log(state, vessel, fault, at, 245, `${vessel.name}: ${faultLibrary[fault.type].name} repaired${drone ? ` by ${drone.name}` : ' by dockside crew'} in ${(at - job.serviceStartedAt!) / MINUTE} minutes. Condition ${vessel.condition.toUpperCase()}. ${activeFaults(vessel).length ? 'Further faults remain.' : fault.emergency ? 'Emergency recovery complete.' : 'Service complete.'}`, 'facility', null, 'Inspection confirmed this subsystem restored.', job, before)
      if (fault.emergency && !activeFaults(vessel).some((f) => f.emergency)) log(state, vessel, fault, at, 390, `${vessel.name}: emergency recovery complete. Crew and vessel secure.`, 'facility', null, 'All emergency faults resolved.', job, before)
      if (!activeFaults(vessel).length && vessel.resumeAfterRepair) {
        vessel.resumeAfterRepair = false
        vessel.assignment = 'delivery'; vessel.startedAt = at; vessel.completesAt = at + TRAVEL_MS; vessel.dockingState = vessel.dockingState === 'docked' ? 'docked' : 'returning'
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
  if (activeFaults(vessel).length || vessel.lastFaultRun === vessel.operatingRuns || vessel.operatingRuns % 12 !== 1 || vessel.operatingRuns < 13) return
  const sequence: FaultType[] = ['drill-wear', 'thruster-malfunction', 'sensor-degradation', 'hull-damage', 'communications-failure', 'cargo-jam', 'power-instability', 'navigation-fault']
  const type = sequence[(Math.floor(vessel.operatingRuns / 12) - 1) % sequence.length]!
  const atDock = type === 'hull-damage' || type === 'cargo-jam'
  if ((context === 'delivery') !== atDock) return
  vessel.lastFaultRun = vessel.operatingRuns
  const fault = detectFault(state, vessel.id, type, at)
  if (fault && type === 'thruster-malfunction' && vessel.operatingRuns > 96) escalateFault(state, vessel, fault, at, true)
}
