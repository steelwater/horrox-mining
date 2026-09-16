import type { KeypadKey, OnboardingStatus } from './types'

export type OnboardingStep = {
  prompt: string
  expectedKey: KeypadKey
  success: string
}

export const onboardingSteps: OnboardingStep[] = [
  {
    prompt: 'Welcome, Captain. I am your onboarding assistant. Press 2 to access crew operations.',
    expectedKey: '2',
    success: 'Crew operations contains personnel status, requests, and communications. Press star to return.',
  },
  {
    prompt: 'Press star to return to the main terminal.',
    expectedKey: '*',
    success: 'Main terminal restored. Press 3 to hear mining operations.',
  },
  {
    prompt: 'Press 3 for mining operations.',
    expectedKey: '3',
    success: 'Mining operations reports extraction activity and captain requests. Press star to return.',
  },
  {
    prompt: 'Press star to return.',
    expectedKey: '*',
    success: 'Press 9 to enable autopilot.',
  },
  {
    prompt: 'Press 9 to enable autopilot.',
    expectedKey: '9',
    success: 'Autopilot enabled. The facility continues operating safely without constant supervision. Press 0 to repeat this message.',
  },
  {
    prompt: 'Press 0 to repeat the last message.',
    expectedKey: '0',
    success: 'Repeat confirmed. Press hash to complete onboarding.',
  },
  {
    prompt: 'Press hash to confirm and complete onboarding.',
    expectedKey: '#',
    success: 'Onboarding complete. Facility control is now yours. Silence is safe; crew and automation will continue normal operations.',
  },
]

export function advanceOnboarding(
  status: OnboardingStatus,
  step: number,
  key: KeypadKey,
): { status: OnboardingStatus; step: number; message: string; accepted: boolean } {
  if (status !== 'active') {
    return { status, step, message: '', accepted: false }
  }

  const current = onboardingSteps[step]
  if (!current) {
    return { status: 'complete', step, message: '', accepted: false }
  }

  if (key !== current.expectedKey) {
    return {
      status,
      step,
      message: `That key is available during normal operations. For onboarding, ${current.prompt}`,
      accepted: false,
    }
  }

  const nextStep = step + 1
  return {
    status: nextStep >= onboardingSteps.length ? 'complete' : 'active',
    step: nextStep,
    message: current.success,
    accepted: true,
  }
}
