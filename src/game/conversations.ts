import type { FacilityState } from './types'
import { events } from './content'
import { repairOptions } from './repairs'

export const RESPONSE_WINDOW_MS = 15_000
export type ConversationClock = { phase: 'prompt' | 'response' | 'paused' | 'holding'; deadline: number | null }
export const pendingCause = (state: FacilityState): string | null => state.pendingEvent ? `${state.pendingEvent.eventId}:${state.pendingEvent.requestedAt}` : null

/** Legacy/unattended events retain safe autonomy; a presented request owns its audio clock. */
export function responseDeadline(state: FacilityState, cause: string, fallback: number): number {
  const clock = state.conversations[cause]
  return clock ? clock.phase === 'response' ? clock.deadline ?? Infinity : Infinity : fallback
}
export function preparePrompt(state: FacilityState, cause: string): void {
  state.conversations[cause] = { phase: 'prompt', deadline: null }
}
export function finishPrompt(state: FacilityState, cause: string, now: number, failed: boolean): void {
  const clock = state.conversations[cause]
  if (!clock || clock.phase !== 'prompt') return
  clock.phase = failed ? 'paused' : 'response'
  clock.deadline = failed ? null : now + RESPONSE_WINDOW_MS
}
export function pauseConversations(state: FacilityState): void {
  for (const clock of Object.values(state.conversations)) { clock.phase = 'paused'; clock.deadline = null }
}
export function pruneConversations(state: FacilityState): void {
  const pending = pendingCause(state)
  const faults = state.vessels.flatMap(v => v.activeFaults.filter(f => f.resolvedAt === null && f.decisionAt !== null).map(f => f.id))
  for (const cause of Object.keys(state.conversations)) if (cause !== pending && !faults.includes(cause)) delete state.conversations[cause]
}

/** Stable IDs describe real work; labels/numbered menu positions are presentation only. */
export function conversationIdentity(state: FacilityState, cause: string) {
  const vessel = state.vessels.find(v => v.activeFaults.some(f => f.id === cause))
  const fault = vessel?.activeFaults.find(f => f.id === cause)
  const definition = events.find(e => state.pendingEvent?.eventId === e.id && pendingCause(state) === cause)
  const originatorId = vessel?.minerId ?? definition?.participants[0] ?? 'facility'
  return {
    eventId: cause,
    originatorId,
    department: state.miners.find(crew => crew.id === originatorId)?.department ?? 'Facility',
    priority: fault?.emergency ? 1 : definition?.priority ?? 2,
    choices: vessel && fault ? Object.values(repairOptions(state, vessel, fault)).map(option => option.action) : Object.values(definition?.choiceIds ?? {}),
    cooldownMs: definition?.cooldownMs ?? 0,
    vesselId: vessel?.id ?? null,
    location: vessel?.dockingState ?? 'facility',
    operationCode: fault?.operationCode ?? definition?.operationCode ?? null,
    promptLineId: `${cause}:request`,
    expiryPolicy: '15-seconds-after-prompt',
    safeDefault: 'crew',
    sourceHistoryIds: state.operations.filter(e => e.repair?.faultId === cause || e.relatedIds.includes(cause)).map(e => e.id),
  }
}
