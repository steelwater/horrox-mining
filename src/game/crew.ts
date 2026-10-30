import { operationCodes } from './operations'
import type { CrewProfile, FacilityState, OperationalEvent, Vessel } from './types'

// Presentation only: never use mood, temperament or experience to change safety actions.
export function crewReport(state: FacilityState, event: Pick<OperationalEvent, 'source' | 'summary' | 'category' | 'operationCode'>): string {
  const crew = state.miners.find((person) => person.id === event.source)
  if (!crew) return event.summary
  let text = event.summary
  const code = event.operationCode
  if (code && operationCodes[code]) {
    const spokenCode = String(code).split('').join(' ')
    const prefix = `${spokenCode}. ${operationCodes[code]}. `
    const fact = text.startsWith(prefix) ? text.slice(prefix.length) : text
    // Urgency stays up front for every speaker. No ornamental phrases during safety traffic.
    text = crew.radioStyle === 'code-first' || event.category === 'safety'
      ? `${prefix}${fact}`
      : crew.radioStyle === 'plain-first'
        ? `${fact} Code ${spokenCode}: ${operationCodes[code]}.`
        : `${operationCodes[code]}, code ${spokenCode}. ${fact}`
  }
  return text
}

/** Both operators support the same real vessel; alternate routine reports, not control or outcomes. */
export function miningReporter(state: FacilityState, vessel: Vessel): string {
  const team = state.miners.filter((crew) => crew.department === 'Mining' && crew.vesselId === vessel.id)
  return team.length ? team[Math.max(0, vessel.run - 1) % team.length]!.id : vessel.minerId
}

export function updateCrewState(state: FacilityState): void {
  for (const crew of state.miners) {
    const vessel = state.vessels.find((v) => v.id === crew.vesselId)
    const workNeedsAttention = !!vessel?.activeFaults.some((fault) => fault.resolvedAt === null)
      || (crew.department === 'Maintenance' && (state.repairJobs.some((job) => job.state !== 'complete') || state.systems.coolant !== 'nominal'))
    crew.currentMood = workNeedsAttention ? 'focused' : vessel?.assignment === 'extraction' ? 'steady' : 'settled'
    if (vessel) crew.currentAssignment = `${vessel.name}: ${vessel.assignment}`
  }
}

export function autonomyExplanation(crew: CrewProfile | undefined): string {
  if (!crew) return ''
  return `${crew.callsign} is applying ${crew.experience === 'newcomer' ? 'the established checklist' : 'established practice'} in ${crew.specialty}; safety limits remain in force.`
}
