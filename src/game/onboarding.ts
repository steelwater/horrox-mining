import { quantity } from './text'
import { formatOperationTime } from './calendar'
import type { FacilityState, KeypadKey, OnboardingStatus } from './types'

export type OnboardingStep = {
  id: string
  expectedKey: KeypadKey
  instruction: string
  report: (state: FacilityState) => string
}

// Commissioning uses real command keys, but readiness checks do not create incidents.
export const onboardingSteps: OnboardingStep[] = [
  {
    id: 'startup', expectedKey: '#', instruction: 'Press hash to begin the readiness checks.',
    report: (s) => `Facility Control online. I am the Mining Facility AI for First Horrox Mining Limited. ${s.commissioned ? 'Readiness review. The commissioning record is' : 'Launch day commissioning date:'} 17 September 2075. Station time: ${formatOperationTime(s.facilityAgeMs)}.`,
  },
  {
    id: 'mining', expectedKey: '3', instruction: 'Press 3 to check mining operations.',
    report: () => 'Mining systems ready. The stable extraction plan is available. Routine work will proceed under crew supervision.',
  },
  {
    id: 'vessels', expectedKey: '3', instruction: 'Press 3 again to acknowledge vessel readiness.',
    report: (s) => `${s.vessels.map((v) => `${v.name}. ${v.condition === 'nominal' ? 'Condition nominal' : 'Routine service required; safe support remains available'}. ${v.dockingState}.`).join(' ')}`,
  },
  {
    id: 'docking', expectedKey: '4', instruction: 'Press 4 to acknowledge docking status.',
    report: (s) => s.systems.berth === 'open' ? 'Berth Four ready. Approach control is available.' : 'Berth Four is isolated for inspection. Vessels can hold safely while the berth is checked.',
  },
  {
    id: 'power', expectedKey: '5', instruction: 'Press 5 to acknowledge power status.',
    report: (s) => `Power systems available. ${s.systems.coolant === 'nominal' ? 'Coolant support nominal.' : 'Coolant inspection is scheduled. Operations remain under controlled supervision.'}`,
  },
  {
    id: 'processing', expectedKey: '6', instruction: 'Press 6 to acknowledge processing status.',
    report: (s) => `Processor One ready. ${quantity(s.processingQueue.length, 'load')} queued. Delivered ore will enter the processing queue.`,
  },
  {
    id: 'communications', expectedKey: '7', instruction: 'Press 7 to acknowledge communications.',
    report: (s) => `Crew communications available. ${s.pendingEvent ? 'One preference request remains open.' : 'No preference requests are pending.'} Crew can resolve unattended requests safely.`,
  },
  {
    id: 'support', expectedKey: '8', instruction: 'Press 8 to acknowledge facility support.',
    report: (s) => `Facility support ready. ${quantity(s.repairDrones.filter((d) => d.state === 'available' && !d.maintenanceDue).length, 'repair drone')} available. ${s.repairDrones.filter((d) => d.targetId !== null).length} assigned to routine service.`,
  },
  {
    id: 'crew', expectedKey: '2', instruction: 'Press 2 to acknowledge crew readiness.',
    report: (s) => `Crew roster. ${s.miners.map((m) => `${m.callsign}, ${m.role.toLowerCase()}.`).join(' ')} All assigned personnel can carry out routine decisions.`,
  },
  {
    id: 'autopilot', expectedKey: '9', instruction: 'Press 9 to enable autopilot.',
    report: (s) => `Autopilot is available and currently ${s.autopilotEnabled ? 'enabled' : 'disabled'}. Operations continue safely without constant commands.`,
  },
  {
    id: 'repeat', expectedKey: '0', instruction: 'Press 0 to repeat this report.',
    report: () => 'Autopilot enabled. Zero repeats an open request or readiness prompt. During normal operations, zero reports current status.',
  },
  {
    id: 'back', expectedKey: '*', instruction: 'Press star to return to the final readiness summary.',
    report: () => 'Star returns to the main terminal during normal operations. Hash confirms when confirmation is requested.',
  },
  {
    id: 'ready', expectedKey: '#', instruction: 'Press hash to confirm readiness and begin normal operations.',
    report: () => 'Readiness checks complete. Mining, vessels, docking, power, processing, communications, support, crew, and autopilot have reported. Facility Control will coordinate safe operation. No further intervention is required.',
  },
]

export function onboardingPrompt(state: FacilityState): string {
  const step = onboardingSteps[state.onboardingStep]!
  return `${step.report(state)} ${step.instruction}`
}

export function advanceOnboarding(
  status: OnboardingStatus,
  step: number,
  key: KeypadKey,
): { status: OnboardingStatus; step: number; accepted: boolean } {
  if (status !== 'active' || key !== onboardingSteps[step]?.expectedKey) return { status, step, accepted: false }
  const nextStep = step + 1
  return { status: nextStep >= onboardingSteps.length ? 'complete' : 'active', step: nextStep, accepted: true }
}
