import { Preferences } from '@capacitor/preferences'
import { createInitialState, findEvent, MAX_CATCHUP_MS } from './engine'
import { onboardingSteps } from './onboarding'
import type { FacilityState } from './types'

// Retain the original key so existing installations migrate in place.
export const SAVE_KEY = 'horrox-facility-v1'
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const count = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : fallback
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
function choice<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? value as T : fallback
}

export function migrateFacility(raw: unknown, now: number): FacilityState {
  const saved = object(raw)
  if (typeof saved.version === 'number' && saved.version > 2) throw new Error('This save needs a newer version of Horrox. It has not been replaced.')
  const marker = Math.min(now, count(saved.lastProcessedAt, count(saved.lastSavedAt, now)))
  const state = createInitialState(marker)
  const timestamp = (value: unknown, fallback: number) => Math.min(count(value, fallback), now)
  const deadline = (value: unknown, fallback: number | null): number | null => {
    if (value === null) return null
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > marker + MAX_CATCHUP_MS) return fallback
    return Math.max(marker, value)
  }
  state.createdAt = timestamp(saved.createdAt, marker)
  state.lastSavedAt = timestamp(saved.lastSavedAt, marker)
  state.lastActiveAt = timestamp(saved.lastActiveAt, state.lastSavedAt)
  for (const field of ['facilityAgeMs', 'productionCycles', 'oreProcessed', 'equipmentWear'] as const) state[field] = count(saved[field], state[field])
  state.autopilotEnabled = saved.autopilotEnabled === true
  state.onboardingStatus = choice(saved.onboardingStatus, ['pending', 'active', 'complete', 'skipped'], 'pending')
  state.onboardingStep = Math.min(onboardingSteps.length - 1, Math.floor(count(saved.onboardingStep, 0)))
  state.history = strings(saved.history).slice(-100)
  state.eventCooldowns = Object.fromEntries(Object.entries(object(saved.eventCooldowns)).filter(([id, at]) => findEvent(id) && typeof at === 'number' && Number.isFinite(at) && at <= now + MAX_CATCHUP_MS)) as Record<string, number>
  const pending = object(saved.pendingEvent)
  if (typeof pending.eventId === 'string' && findEvent(pending.eventId)) state.pendingEvent = { eventId: pending.eventId, requestedAt: timestamp(pending.requestedAt, marker) }
  if (Array.isArray(saved.miners)) {
    const savedMiners = saved.miners
    state.miners = state.miners.map((miner) => {
      const prior = object(savedMiners.find((m) => object(m).id === miner.id))
      return {
        ...miner,
        currentMood: typeof prior.currentMood === 'string' ? prior.currentMood : miner.currentMood,
        currentAssignment: typeof prior.currentAssignment === 'string' ? prior.currentAssignment : miner.currentAssignment,
        history: strings(prior.history),
        relationships: {
          ...miner.relationships,
          ...Object.fromEntries(Object.entries(object(prior.relationships)).filter(([, v]) => typeof v === 'string')) as Record<string, string>,
        },
      }
    })
  }
  if (Array.isArray(saved.vessels)) {
    state.vessels = state.vessels.map((vessel) => {
      const prior = object((saved.vessels as unknown[]).find((v) => object(v).id === vessel.id))
      if (!Object.keys(prior).length) return vessel
      const assignment = choice(prior.assignment, ['extraction', 'delivery', 'standby', 'approach'], vessel.assignment)
      return {
        ...vessel,
        assignment,
        condition: choice(prior.condition, ['nominal', 'service-required'], 'nominal'),
        dockingState: choice(prior.dockingState, ['deployed', 'returning', 'docked', 'holding', 'approaching'], vessel.dockingState),
        startedAt: timestamp(prior.startedAt, marker),
        completesAt: assignment === 'standby' ? null : deadline(prior.completesAt, marker + 900_000) ?? marker + 900_000,
        cargo: Math.min(16, count(prior.cargo, 0)),
        delivered: count(prior.delivered, 0),
        run: Math.floor(count(prior.run, vessel.run)),
        miningProgress: Math.min(1, count(prior.miningProgress, 0)),
        cut: choice(prior.cut, ['stable', 'dense'], 'stable'),
      }
    })
  }
  const systems = object(saved.systems)
  state.systems = {
    berth: choice(systems.berth, ['open', 'isolated'], 'open'),
    berthInspectionAt: null,
    coolant: choice(systems.coolant, ['nominal', 'inspection'], 'nominal'),
    coolantInspectionAt: null,
    scanner: choice(systems.scanner, ['nominal', 'manual-sampling'], 'nominal'),
    scannerCalibrationAt: null,
  }
  if (state.systems.berth === 'isolated') state.systems.berthInspectionAt = deadline(systems.berthInspectionAt, marker + 300_000) ?? marker + 300_000
  if (state.systems.coolant === 'inspection') state.systems.coolantInspectionAt = deadline(systems.coolantInspectionAt, marker + 300_000) ?? marker + 300_000
  if (state.systems.scanner === 'manual-sampling') state.systems.scannerCalibrationAt = deadline(systems.scannerCalibrationAt, marker + 300_000) ?? marker + 300_000
  const drone = object(Array.isArray(saved.repairDrones) ? saved.repairDrones[0] : null)
  if (state.vessels.some((v) => v.id === drone.targetId && v.condition === 'service-required' && v.dockingState === 'docked')) state.repairDrones[0] = { id: 'dr-01', targetId: drone.targetId as string, completesAt: deadline(drone.completesAt, marker + 300_000) ?? marker + 300_000 }
  if (Array.isArray(saved.processingQueue)) state.processingQueue = saved.processingQueue.flatMap((entry) => {
    const q = object(entry)
    return typeof q.id === 'string' && typeof q.vesselId === 'string' && state.vessels.some((v) => v.id === q.vesselId)
      ? [{ id: q.id, vesselId: q.vesselId, tonnes: Math.min(16, count(q.tonnes, 0)), completesAt: deadline(q.completesAt, marker + 180_000) ?? marker + 180_000 }] : []
  }).slice(0, 100)
  if (Array.isArray(saved.operations)) state.operations = saved.operations.flatMap((entry) => {
    const e = object(entry)
    return typeof e.id === 'string' && typeof e.summary === 'string' && typeof e.source === 'string' ? [{ id: e.id, summary: e.summary, source: e.source, timestamp: timestamp(e.timestamp, marker), category: choice(e.category, ['mining', 'docking', 'maintenance', 'problem', 'safety', 'chatter', 'processing'], 'problem'), relatedIds: strings(e.relatedIds), actionRequested: e.actionRequested === true, resolution: choice(e.resolution, ['pending', 'manual', 'autonomous'], 'autonomous'), reason: typeof e.reason === 'string' ? e.reason : null }] : []
  }).slice(-1000).sort((a, b) => a.timestamp - b.timestamp)
  state.nextOperationId = Math.max(1, Math.floor(count(saved.nextOperationId, 1)), ...state.operations.map((e) => count(Number(e.id.replace('op-', '')), 0) + 1))
  if (Array.isArray(saved.transcript)) state.transcript = saved.transcript.flatMap((entry) => {
    const e = object(entry)
    return typeof e.id === 'string' && typeof e.text === 'string' && typeof e.speaker === 'string' ? [{ id: e.id, text: e.text, speaker: e.speaker, timestamp: timestamp(e.timestamp, marker), priority: Math.max(1, Math.min(6, Math.floor(count(e.priority, 3)))) as 1 | 2 | 3 | 4 | 5 | 6 }] : []
  }).slice(-80)
  return state
}

export async function loadFacility(): Promise<FacilityState | null> {
  const { value } = await Preferences.get({ key: SAVE_KEY })
  if (!value) return null
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch {
    throw new Error('The saved operation could not be read. It has not been replaced.')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The saved operation is not valid. It has not been replaced.')
  return migrateFacility(parsed, Date.now())
}

let writes: Promise<void> = Promise.resolve()
export function saveFacility(state: FacilityState): Promise<void> {
  // Snapshot before queueing; an older asynchronous write must never win a race.
  const value = JSON.stringify(state)
  writes = writes.catch(() => undefined).then(() => Preferences.set({ key: SAVE_KEY, value }))
  return writes
}
