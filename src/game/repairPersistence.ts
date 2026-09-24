import { faultLibrary, recalculateCondition } from './repairs'
import type { FacilityState, FaultType, RepairAction, RepairJob, RepairRecord, VesselCondition, VesselFault } from './types'

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback
const number = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : fallback
const nullable = (value: unknown) => value === null || value === undefined ? null : number(value, 0)
function choice<T extends string>(value: unknown, values: readonly T[], fallback: T): T { return values.includes(value as T) ? value as T : fallback }
const conditions: VesselCondition[] = ['nominal', 'degraded', 'fault', 'critical', 'offline']
const actions: RepairAction[] = ['diagnostics', 'drone', 'dock', 'safe-return', 'continue', 'stop', 'crew', 'recommend']
const types = Object.keys(faultLibrary) as FaultType[]
export function readRepairRecord(raw: unknown): RepairRecord | undefined {
  const r = object(raw)
  if (!types.includes(r.faultType as FaultType) || !r.vesselId || !r.faultId) return undefined
  return { vesselId: text(r.vesselId), faultId: text(r.faultId), faultType: r.faultType as FaultType, subsystem: text(r.subsystem), severity: choice(r.severity, conditions, 'fault'), conditionBefore: choice(r.conditionBefore, conditions, 'nominal'), conditionAfter: choice(r.conditionAfter, conditions, 'nominal'), detectedAt: number(r.detectedAt, 0), actor: text(r.actor, 'facility'), action: actions.includes(r.action as RepairAction) ? r.action as RepairAction : null, droneId: typeof r.droneId === 'string' ? r.droneId : null, jobId: typeof r.jobId === 'string' ? r.jobId : null, serviceStartedAt: nullable(r.serviceStartedAt), completedAt: nullable(r.completedAt), outcome: r.outcome === 'restored' ? 'restored' : null, availability: choice(r.availability, ['working', 'available', 'unavailable'], 'unavailable') }
}

export function restoreRepairs(state: FacilityState, saved: Record<string, unknown>): void {
  const marker = state.lastProcessedAt
  const time = (v: unknown) => Math.min(marker, number(v, marker))
  const deadline = (v: unknown): number | null => v === null ? null : Math.max(marker, Math.min(marker + 7 * 24 * 60 * 60_000, number(v, marker + 300_000)))
  for (const vessel of state.vessels) {
    const prior = object(array(saved.vessels).find((v) => object(v).id === vessel.id))
    vessel.routineServiceDue = prior.condition === 'service-required' || prior.routineServiceDue === true
    vessel.operatingRuns = Math.floor(number(prior.operatingRuns, 0))
    vessel.lastFaultRun = Math.floor(number(prior.lastFaultRun, 0))
    vessel.resumeAfterRepair = prior.resumeAfterRepair === true
    vessel.serviceHistory = array(prior.serviceHistory).filter((v): v is string => typeof v === 'string').slice(-100)
    const ids = new Set<string>()
    vessel.activeFaults = array(prior.activeFaults).flatMap((entry): VesselFault[] => {
      const f = object(entry)
      if (!types.includes(f.type as FaultType) || typeof f.id !== 'string' || ids.has(f.id)) return []
      ids.add(f.id)
      return [{ id: f.id, type: f.type as FaultType, severity: choice(f.severity, conditions, faultLibrary[f.type as FaultType].severity), detectedAt: time(f.detectedAt), decisionAt: deadline(f.decisionAt), escalatesAt: deadline(f.escalatesAt), resolvedAt: f.resolvedAt === null || f.resolvedAt === undefined ? null : time(f.resolvedAt), action: actions.includes(f.action as RepairAction) ? f.action as RepairAction : null, operationCode: number(f.operationCode, 205), emergency: f.emergency === true }]
    })
    recalculateCondition(vessel)
  }
  const ids = new Set<string>()
  state.repairJobs = array(saved.repairJobs).flatMap((entry): RepairJob[] => {
    const j = object(entry)
    const vessel = state.vessels.find((v) => v.id === j.vesselId)
    if (typeof j.id !== 'string' || ids.has(j.id) || !vessel?.activeFaults.some((f) => f.id === j.faultId)) return []
    ids.add(j.id)
    return [{ id: j.id, vesselId: vessel.id, faultId: text(j.faultId), method: choice(j.method, ['remote-drone', 'dock'], 'dock'), assignedDroneId: state.repairDrones.some((d) => d.id === j.assignedDroneId) ? text(j.assignedDroneId) : null, state: choice(j.state, ['waiting', 'dispatched', 'in-transit', 'returning-vessel', 'docking', 'servicing', 'complete'], 'waiting'), createdAt: time(j.createdAt), dispatchedAt: nullable(j.dispatchedAt), serviceStartedAt: nullable(j.serviceStartedAt), completedAt: nullable(j.completedAt), nextAt: deadline(j.nextAt), outcome: j.outcome === 'restored' ? 'restored' : null }]
  })
  for (const drone of state.repairDrones) {
    const d = object(array(saved.repairDrones).find((v) => object(v).id === drone.id))
    drone.state = choice(d.state, ['available', 'dispatched', 'in-transit', 'servicing', 'returning', 'maintenance', 'unavailable'], drone.targetId ? 'servicing' : 'available')
    drone.location = text(d.location, 'facility')
    drone.assignedJobId = state.repairJobs.some((j) => j.id === d.assignedJobId && j.assignedDroneId === drone.id) ? text(d.assignedJobId) : null
    if (drone.assignedJobId) drone.targetId = state.repairJobs.find((j) => j.id === drone.assignedJobId)!.vesselId
    drone.completesAt = ['available', 'unavailable'].includes(drone.state) ? null : deadline(d.completesAt)
    drone.transitStartedAt = nullable(d.transitStartedAt)
    drone.serviceStartedAt = nullable(d.serviceStartedAt)
    drone.maintenanceDue = d.maintenanceDue === true
    drone.serviceHistory = array(d.serviceHistory).filter((v): v is string => typeof v === 'string').slice(-100)
    if (['dispatched', 'in-transit', 'servicing'].includes(drone.state) && drone.assignedJobId) drone.completesAt = null
    if (['returning', 'maintenance'].includes(drone.state) || (drone.state === 'servicing' && !drone.assignedJobId)) drone.completesAt ??= marker + 300_000
    if (drone.state === 'available') { drone.targetId = null; drone.assignedJobId = null }

    if (['dispatched', 'in-transit', 'servicing'].includes(drone.state) && !drone.assignedJobId && !drone.targetId) {
      drone.state = 'available'; drone.completesAt = null
    }
  }
  for (const job of state.repairJobs) {
    if (job.state === 'complete') { job.nextAt = null; continue }
    if (job.state === 'waiting') job.nextAt = null
    if (job.method === 'remote-drone' && !state.repairDrones.some((d) => d.assignedJobId === job.id) && job.state !== 'waiting') { job.state = 'waiting'; job.assignedDroneId = null; job.nextAt = null }
    else if (job.state !== 'waiting' && job.nextAt === null) job.nextAt = marker + 300_000
  }
  // Broken references must leave a recoverable decision, not an abandoned vessel.
  for (const v of state.vessels) for (const f of v.activeFaults.filter((f) => f.resolvedAt === null)) {
    if (!state.repairJobs.some((j) => j.faultId === f.id && j.state !== 'complete') && f.action !== 'continue' && f.decisionAt === null) f.decisionAt = marker + 300_000
  }
  state.nextRepairId = Math.max(1, number(saved.nextRepairId, 1), ...state.repairJobs.map((j) => number(Number(j.id.replace('repair-', '')), 0) + 1), ...state.vessels.flatMap((v) => v.activeFaults.map((f) => number(Number(f.id.replace('fault-', '')), 0) + 1)))
}
