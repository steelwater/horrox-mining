import type { FacilityState } from './types'

export const OPERATION_START = '2075-09-17' as const
const START_MS = Date.UTC(2075, 8, 17)

// The station calendar is independent of the device's timezone and calendar date.
export function operationDate(elapsedMs: number): Date {
  const date = new Date(START_MS + (Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0))
  return Number.isFinite(date.getTime()) ? date : new Date(START_MS)
}

export function formatOperationTime(elapsedMs: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(operationDate(elapsedMs))
}

export function operationAgeAt(state: Pick<FacilityState, 'facilityAgeMs' | 'lastProcessedAt'>, timestamp: number): number {
  return Math.max(0, state.facilityAgeMs + timestamp - state.lastProcessedAt)
}
