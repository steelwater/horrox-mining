import { operationAgeAt } from './calendar'
import { chatter } from './chatter'
import type { CrewProfile, FacilityState } from './types'

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')
const fail = (): never => { throw new Error('Invalid crew identity or chatter memory. Current operation has not been replaced.') }

export function restoreCrew(state: FacilityState, saved: Record<string, unknown>): void {
  if (saved.version !== 5 && saved.version !== 6) return // Deterministic defaults already coexist with legacy mood/history/relationships.
  if (!Array.isArray(saved.miners) || saved.miners.length !== state.miners.length) fail()
  const roster = saved.miners as unknown[]
  const ids = state.miners.map((crew) => crew.id)
  state.miners = state.miners.map((starter): CrewProfile => {
    const matches = roster.filter((crew) => record(crew) && crew.id === starter.id)
    const prior = matches[0]
    if (matches.length !== 1 || !record(prior)) return fail()
    if (Object.keys(prior).length !== Object.keys(starter).length || Object.keys(prior).some((key) => !(key in starter))) fail()
    for (const key of ['id', 'name', 'callsign', 'role', 'temperament', 'specialty', 'currentMood', 'currentAssignment'] as const) if (typeof prior[key] !== 'string' || !prior[key]) fail()
    for (const key of ['personalityTraits', 'speechHabits', 'preferredCoworkers', 'competenceAreas', 'history'] as const) if (!strings(prior[key])) fail()
    if (!['Mining', 'Docking', 'Maintenance', 'Refinery', 'Grading', 'Storage', 'Cargo', 'Transport'].includes(prior.department as string)
      || !['veteran', 'established', 'newcomer'].includes(prior.experience as string)
      || !['code-first', 'plain-first', 'conversational'].includes(prior.radioStyle as string)
      || !['steady', 'bright', 'measured'].includes(prior.voiceProfileId as string)
      || (prior.vesselId !== null && !state.vessels.some((v) => v.id === prior.vesselId))
      || (prior.lastPhrase !== null && typeof prior.lastPhrase !== 'string')
      || !record(prior.relationships) || Object.entries(prior.relationships).some(([id, value]) => !ids.includes(id) || typeof value !== 'string')
      || (prior.preferredCoworkers as string[]).some((id) => !ids.includes(id))) fail()
    return structuredClone(prior) as CrewProfile
  })
  if (!Array.isArray(saved.vessels)) fail()
  for (const vessel of state.vessels) {
    const raw = (saved.vessels as unknown[]).find((v) => record(v) && v.id === vessel.id)
    if (!record(raw) || !state.miners.some((crew) => crew.id === raw.minerId && crew.vesselId === vessel.id)) return fail()
    vessel.minerId = raw.minerId as string
  }
  if (!record(saved.chatterMemory)) fail()
  const memory = saved.chatterMemory as Record<string, unknown>
  const keys = [...chatter.map((exchange) => exchange.id), 'pack:TS', 'pack:RL', 'ambient', 'heard:TS', ...chatter.filter((exchange) => exchange.pack === 'RL').map((exchange) => `heard:${exchange.id}`)]
  if (Object.entries(memory).some(([id, age]) => !keys.includes(id) || typeof age !== 'number' || !Number.isFinite(age) || age < 0 || age > operationAgeAt(state, Math.max(state.lastProcessedAt, state.lastSavedAt)))) fail()
  state.chatterMemory = { ...memory } as Record<string, number>
}
