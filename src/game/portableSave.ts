import { quantity } from './text'
import { build, buildLabel } from './build'
import { formatOperationTime } from './calendar'
import { createInitialState, findEvent } from './engine'
import { migrateFacility } from './persistence'
import type { FacilityState, OperationalEvent, TranscriptEntry } from './types'

export const SAVE_FORMAT = 'horrox-mining-portable-save'
export const SAVE_SCHEMA = 4

export function formatTranscript(entries: TranscriptEntry[]): string {
  return [`1st Horrox Mining Ltd. — ${buildLabel}`, ...[...entries].sort((a, b) => a.timestamp - b.timestamp)
    .map((entry) => `[${formatOperationTime(entry.operationAgeMs)}] ${entry.speaker}: ${entry.text}`)].join('\n')
}

export function formatOperationalHistory(entries: OperationalEvent[]): string {
  const chronological = [...entries].sort((a, b) => a.operationAgeMs - b.operationAgeMs || a.timestamp - b.timestamp || Number(a.id.replace('op-', '')) - Number(b.id.replace('op-', '')))
  return [`1st Horrox Mining Ltd. — ${buildLabel}`, 'OPERATIONAL HISTORY', quantity(entries.length, 'event'),
    ...chronological.map((entry) => [
      `[${formatOperationTime(entry.operationAgeMs)}]`,
      `Source: ${entry.source}`,
      ...(entry.repair && entry.repair.actor !== entry.source ? [`Actor: ${entry.repair.actor}`] : []),
      `Resolution: ${entry.resolution}`,
      entry.summary,
      ...(entry.reason ? [`Reason: ${entry.reason}`] : []),
    ].join('\n'))].join('\n\n')
}

export function exportSave(state: FacilityState, now = Date.now()): string {
  return JSON.stringify({ format: SAVE_FORMAT, schemaVersion: state.version, appVersion: build.version,
    milestone: build.milestone, exportedAt: new Date(now).toISOString(), state }, null, 2)
}

type RecordValue = Record<string, unknown>
function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function invalid(path: string): never { throw new Error(`Save is incomplete or invalid at ${path}. Current operation unchanged.`) }
const numeric = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER

// Explicit nullable fields and empty collections supplement the persistent initial model.
// This boundary is strict; normal on-device migration remains tolerant of legacy saves.
const nullableText = new Set(['targetId', 'assignedJobId', 'assignedDroneId', 'action', 'reason', 'outcome', 'droneId', 'jobId'])
const samples: Record<string, unknown> = {
  activeFaults: { id: '', type: '', severity: '', detectedAt: 0, decisionAt: null, escalatesAt: null, resolvedAt: null, action: null, operationCode: 0, emergency: false },
  repairJobs: { id: '', vesselId: '', faultId: '', method: '', assignedDroneId: null, state: '', createdAt: 0, dispatchedAt: null, serviceStartedAt: null, completedAt: null, nextAt: null, outcome: null },
  processingQueue: { id: '', vesselId: '', tonnes: 0, completesAt: 0 },
  operations: { id: '', timestamp: 0, operationAgeMs: 0, source: '', category: '', summary: '', relatedIds: [''], actionRequested: false, resolution: '', reason: null },
  transcript: { id: '', speaker: '', text: '', timestamp: 0, operationAgeMs: 0, priority: 0 },
}
function checkShape(value: unknown, sample: unknown, path: string, field = ''): void {
  if (sample === null) {
    if (value === null) return
    if (field === 'pendingEvent') {
      checkShape(value, { eventId: '', requestedAt: 0 }, path)
      if (!findEvent((value as RecordValue).eventId as string)) invalid(path)
    } else if (nullableText.has(field) ? typeof value !== 'string' : !numeric(value)) invalid(path)
  } else if (Array.isArray(sample)) {
    if (!Array.isArray(value)) invalid(path)
    const item = samples[field] ?? sample[0] ?? ''
    value.forEach((entry, i) => checkShape(entry, item, `${path}[${i}]`))
  } else if (record(sample)) {
    if (!record(value)) invalid(path)
    if (field === 'eventCooldowns') {
      for (const [id, at] of Object.entries(value)) if (!findEvent(id) || !numeric(at)) invalid(path)
    } else if (field === 'relationships') {
      if (Object.values(value).some((v) => typeof v !== 'string')) invalid(path)
    } else for (const [key, child] of Object.entries(sample)) checkShape(value[key], child, `${path}.${key}`, key)
  } else if (typeof sample === 'number' ? !numeric(value) : typeof value !== typeof sample) invalid(path)
}

function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]))
  if (record(a) && record(b)) return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((key) => same(a[key], b[key]))
  return a === b
}

function legacyMatches(raw: unknown, migrated: unknown, field = ''): boolean {
  if (field === 'version') return raw === 3 && migrated === 4
  if (field === 'condition' && raw === 'service-required') return migrated === 'nominal'
  if (Array.isArray(raw) && Array.isArray(migrated)) return raw.length === migrated.length && raw.every((entry, i) => legacyMatches(entry, migrated[i]))
  if (record(raw) && record(migrated)) return Object.keys(raw).every((key) => legacyMatches(raw[key], migrated[key], key))
  return raw === migrated
}

export function parseSave(text: string, now = Date.now()): FacilityState {
  let envelope: unknown
  try { envelope = JSON.parse(text) } catch { throw new Error('Malformed JSON. Current operation unchanged.') }
  if (!record(envelope) || envelope.format !== SAVE_FORMAT) throw new Error('Not a Horrox portable save. Current operation unchanged.')
  // Portable envelopes support the living-mine schema and its repair successor.
  // Schema 1/2 installation saves still migrate through the normal load path.
  if (envelope.schemaVersion !== 3 && envelope.schemaVersion !== SAVE_SCHEMA) throw new Error('Unsupported save schema. Supported portable schemas: 3 and 4. Current operation unchanged.')
  if (typeof envelope.appVersion !== 'string' || !envelope.appVersion || !numeric(envelope.milestone)
    || typeof envelope.exportedAt !== 'string' || !Number.isFinite(Date.parse(envelope.exportedAt))) invalid('metadata')
  const raw = envelope.state
  if (!record(raw) || raw.version !== envelope.schemaVersion) invalid('state.version')
  const template = JSON.parse(JSON.stringify(createInitialState(now))) as RecordValue
  if (raw.version === 3) {
    delete template.repairJobs; delete template.nextRepairId
    for (const vessel of template.vessels as RecordValue[]) for (const key of ['routineServiceDue', 'activeFaults', 'serviceHistory', 'operatingRuns', 'lastFaultRun', 'resumeAfterRepair']) delete vessel[key]
    for (const drone of template.repairDrones as RecordValue[]) for (const key of ['name', 'state', 'location', 'assignedJobId', 'transitStartedAt', 'serviceStartedAt', 'maintenanceDue', 'serviceHistory']) delete drone[key]
  }
  checkShape(raw, template, 'state')
  if (raw.operationStart !== template.operationStart) invalid('state.operationStart')
  for (const key of ['miners', 'vessels', 'repairDrones']) {
    const expected = template[key] as RecordValue[]
    const actual = raw[key] as RecordValue[]
    if (actual.length !== expected.length || expected.some((entry) => actual.filter((v) => v.id === entry.id).length !== 1)) invalid(`state.${key}`)
  }
  // Validate against the normalizer at the saved clock, before real-time catch-up.
  // Any corrected/dropped field in a current schema indicates an invalid contract.
  const migrated = migrateFacility(raw, Math.max(raw.lastProcessedAt as number, raw.lastSavedAt as number, raw.lastActiveAt as number))
  if (raw.version === SAVE_SCHEMA && !same(raw, migrated)) invalid('state (values or references)')
  if (raw.version === 3 && !legacyMatches(raw, migrated)) invalid('state (legacy values or references)')
  if (Math.max(raw.lastProcessedAt as number, raw.lastSavedAt as number, raw.lastActiveAt as number) > now) throw new Error('Save clock is ahead of this device. Check the device clock before importing.')
  return migrated
}
