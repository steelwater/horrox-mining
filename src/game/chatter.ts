import { crossAppChatter } from './crossAppChatter'
import { operationAgeAt } from './calendar'
import { activeFaults, pendingFaults } from './repairs'
import type { ChatterExchange, FacilityState } from './types'

const MINUTE = 60_000
// Prototype dialogue, pending content-owner approval. Contexts describe real work,
// not personality or mood. No early-arrival claim exists without an early-arrival model.
export const chatter: ChatterExchange[] = [
  ...crossAppChatter,
  { id: 'sampling-patience', context: 'mining', cooldownMs: 30 * MINUTE, lines: [
    { speaker: 'Rill', profile: 'bright', text: 'Deepwell, does checking the same reading twice count as patience?' },
    { speaker: 'Deepwell', profile: 'measured', text: 'Only if you leave time between the checks.' },
  ] },
  { id: 'sampling-sequence', context: 'mining', cooldownMs: 40 * MINUTE, lines: [
    { speaker: 'Rill', profile: 'bright', text: 'Sample, record, then move on. I like a sequence that tells you when you are finished.' },
  ] },
  { id: 'productive-confidence', context: 'mining', cooldownMs: 60 * MINUTE, lines: [
    { speaker: 'Patch', profile: 'bright', text: 'Deepwell, your excavator is making that noise again.' },
    { speaker: 'Deepwell', profile: 'measured', text: 'That noise is called productive confidence.' },
  ] },
  { id: 'steady-cut', context: 'mining', cooldownMs: 35 * MINUTE, lines: [
    { speaker: 'Deepwell', profile: 'measured', text: 'Still cutting. The interesting part of this job is knowing when to leave the controls alone.' },
  ] },
  { id: 'patient-rock', context: 'mining', cooldownMs: 45 * MINUTE, lines: [
    { speaker: 'Deepwell', profile: 'measured', text: 'No need to hurry the cut. The rock has had considerably longer to prepare than we have.' },
  ] },
  { id: 'machine-music', context: 'mining', cooldownMs: 45 * MINUTE, lines: [
    { speaker: 'Patch', profile: 'bright', text: 'Deepwell, do you ever get tired of listening to that drill?' },
    { speaker: 'Deepwell', profile: 'measured', text: 'I get more concerned when I cannot hear it.' },
  ] },
  { id: 'small-bites', context: 'mining', cooldownMs: 30 * MINUTE, lines: [
    { speaker: 'Deepwell', profile: 'measured', text: 'Small bites, steady pressure. There are worse ways to spend a shift.' },
  ] },
  { id: 'quiet-radio', context: 'mining', cooldownMs: 40 * MINUTE, lines: [
    { speaker: 'Deepwell', profile: 'measured', text: 'Still here, Control. Just giving the drill my full attention.' },
  ] },
  { id: 'hauler-berthed', context: 'dock', cooldownMs: 45 * MINUTE, lines: [
    { speaker: 'Latch', profile: 'steady', text: 'Hauler Two at the berth. Always good to have the traffic on our side of the window.' },
  ] },
  { id: 'dock-perspective', context: 'dock', cooldownMs: 35 * MINUTE, lines: [
    { speaker: 'Latch', profile: 'steady', text: 'A parked hauler looks smaller from the control desk. I recommend keeping that perspective.' },
  ] },
  { id: 'paint-lines', context: 'dock', cooldownMs: 45 * MINUTE, lines: [
    { speaker: 'Latch', profile: 'steady', text: 'Please continue respecting the deck markings. Paint is cheaper than explaining why we ignored it.' },
  ] },
  { id: 'dock-quiet', context: 'dock', cooldownMs: 40 * MINUTE, lines: [
    { speaker: 'Latch', profile: 'steady', text: 'This is the part of docking I like. The ship has stopped moving.' },
    { speaker: 'Patch', profile: 'bright', text: 'A useful quality in anything that large.' },
  ] },
  { id: 'processor-patience', context: 'processing', cooldownMs: 35 * MINUTE, lines: [
    { speaker: 'Patch', profile: 'bright', text: 'Processor One has work in the queue. Staring at it does not improve the throughput. I have checked.' },
  ] },
  { id: 'ore-to-numbers', context: 'processing', cooldownMs: 40 * MINUTE, lines: [
    { speaker: 'Latch', profile: 'steady', text: 'Ore goes in, numbers come out. Processing makes the whole business sound very tidy.' },
  ] },
  { id: 'processing-clock', context: 'processing', cooldownMs: 35 * MINUTE, lines: [
    { speaker: 'Patch', profile: 'bright', text: 'Leaving the processor to its cycle. Machines are much better company when you let them finish.' },
  ] },
  { id: 'patient-queue', context: 'processing', cooldownMs: 45 * MINUTE, lines: [
    { speaker: 'Latch', profile: 'steady', text: 'The processing queue is more patient than the meal queue.' },
    { speaker: 'Patch', profile: 'bright', text: 'The processing queue has a reliable completion estimate.' },
  ] },
  { id: 'torque-driver', context: 'maintenance', cooldownMs: 60 * MINUTE, lines: [
    { speaker: 'Patch', profile: 'bright', text: 'I found the missing torque driver. It was in the box labeled torque drivers.' },
  ] },
  { id: 'spare-labels', context: 'maintenance', cooldownMs: 50 * MINUTE, lines: [
    { speaker: 'Patch', profile: 'bright', text: 'If you borrow a tool, put it back. If you borrow the label, I have further questions.' },
  ] },
  { id: 'uneventful-shift', context: 'maintenance', cooldownMs: 40 * MINUTE, lines: [
    { speaker: 'Patch', profile: 'bright', text: 'Nothing waiting on my repair bench. I am choosing to take that as a compliment.' },
  ] },
  { id: 'maintenance-success', context: 'maintenance', cooldownMs: 45 * MINUTE, lines: [
    { speaker: 'Latch', profile: 'steady', text: 'Maintenance is quiet.' },
    { speaker: 'Patch', profile: 'bright', text: 'We do occasionally achieve that deliberately.' },
  ] },
  { id: 'tool-drawer', context: 'maintenance', cooldownMs: 50 * MINUTE, lines: [
    { speaker: 'Patch', profile: 'bright', text: 'One day I will organize the tool drawers so well that nobody can find anything.' },
  ] },
  { id: 'unexciting-machinery', context: 'maintenance', cooldownMs: 40 * MINUTE, lines: [
    { speaker: 'Patch', profile: 'bright', text: 'Unexciting machinery. That is what I want from the rest of this shift.' },
  ] },

]

export function chatterContextMatches(state: FacilityState, exchange: ChatterExchange): boolean {
  const excavator = state.vessels.find((v) => v.id === 'excavator-03')
  const hauler = state.vessels.find((v) => v.id === 'hauler-02')
  switch (exchange.context) {
    case 'quiet': return state.systems.coolant === 'nominal' && state.systems.scanner === 'nominal'
    case 'transfer': return state.vessels.some((v) => v.id === state.miners.find((crew) => crew.id === 'tess-oren')?.vesselId && v.assignment === 'delivery' && v.dockingState === 'returning' && !activeFaults(v).length)
    case 'mining': return !!excavator && excavator.assignment === 'extraction' && excavator.dockingState === 'deployed' && !excavator.routineServiceDue && !activeFaults(excavator).length
    case 'dock': return state.systems.berth === 'open' && hauler?.dockingState === 'docked' && !activeFaults(hauler).length && !state.repairJobs.some((j) => j.method === 'dock' && j.state !== 'complete')
    case 'processing': return state.processingQueue.length > 0 && state.systems.coolant === 'nominal' && state.systems.scanner === 'nominal'
    case 'maintenance': return state.vessels.every((v) => !activeFaults(v).length && !v.routineServiceDue) && state.repairDrones.every((d) => d.state === 'available' && !d.maintenanceDue) && state.systems.coolant === 'nominal' && state.systems.scanner === 'nominal'
  }
}

export function eligibleChatter(state: FacilityState, now: number): ChatterExchange[] {
  if (!state.commissioned || state.onboardingStatus === 'active' || state.pendingEvent || pendingFaults(state).length
    || state.systems.berth !== 'open' || state.systems.coolant !== 'nominal' || state.systems.scanner !== 'nominal'
    || state.repairJobs.some((j) => j.state !== 'complete')
    || state.repairDrones.some((d) => d.state !== 'available' || d.maintenanceDue)
    || state.vessels.some((v) => activeFaults(v).length || v.routineServiceDue || v.dockingState === 'approaching')) return []
  const age = operationAgeAt(state, now)
  const traffic = state.transcript.filter((e) => e.priority < 5).at(-1)
  const operation = state.operations.filter((e) => e.category !== 'chatter').at(-1)
  if (age - Math.max(traffic?.operationAgeMs ?? 0, operation?.operationAgeMs ?? 0) < 30_000) return []
  // History retains cooldowns even when the shorter visible transcript rolls over.
  const heard = state.operations.filter((e) => e.category === 'chatter')
  const lastAmbient = Math.max(state.chatterMemory.ambient ?? -Infinity, heard.at(-1)?.operationAgeMs ?? -Infinity,
    state.transcript.filter((e) => e.priority === 5).at(-1)?.operationAgeMs ?? -Infinity)
  if (age - lastAmbient < 2 * MINUTE) return []
  return chatter.filter((exchange) => {
    const last = state.chatterMemory[exchange.id] ?? heard.filter((e) => e.relatedIds.includes(exchange.id)).at(-1)?.operationAgeMs
      ?? state.transcript.filter((e) => e.priority === 5 && exchange.lines.some((line) => line.text === e.text)).at(-1)?.operationAgeMs
      ?? -Infinity
    if (exchange.pack) {
      const memory = state.chatterMemory
      if (age < 15 * MINUTE || age - Math.max(memory['pack:TS'] ?? -Infinity, memory['pack:RL'] ?? -Infinity) < 45 * MINUTE) return false
      if (exchange.pack === 'RL' && memory['heard:TS'] === undefined) return false
      if (exchange.requires && memory[`heard:${exchange.requires}`] === undefined) return false
      // Leave room to finish a rare exchange before a known vessel/processing transition.
      if (state.vessels.some((v) => v.completesAt !== null && v.completesAt - now < 60_000)
        || state.processingQueue.some((load) => load.completesAt - now < 60_000)) return false
      if (state.vessels.some((v) => v.dockingState === 'returning') && exchange.context !== 'transfer') return false
    } else if (state.vessels.some((v) => v.dockingState === 'returning')) return false
    return age - last >= exchange.cooldownMs && chatterContextMatches(state, exchange)
  })
}

/** Record only when a line actually starts. Canceled exchanges are not replayed as a backlog. */
export function rememberChatter(state: FacilityState, exchange: ChatterExchange, now: number): void {
  const age = operationAgeAt(state, now)
  state.chatterMemory[exchange.id] = age
  state.chatterMemory.ambient = age
  if (exchange.pack) state.chatterMemory[`pack:${exchange.pack}`] = age
}

export function rememberChatterContext(state: FacilityState, exchange: ChatterExchange, now: number): void {
  // Called at the final line: the title/recommendation has already been heard, even if this tail is interrupted.
  if (exchange.pack) state.chatterMemory[`heard:${exchange.pack === 'TS' ? 'TS' : exchange.id}`] = operationAgeAt(state, now)
}
