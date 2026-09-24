import { describe, expect, it } from 'vitest'
import { advanceOnboarding, onboardingPrompt, onboardingSteps } from '../src/game/onboarding'

import { createInitialState } from '../src/game/engine'

describe('onboarding', () => {
  it('preserves progress when the wrong key is pressed', () => {
    const result = advanceOnboarding('active', 0, '3')
    expect(result.accepted).toBe(false)
    expect(result.step).toBe(0)
    expect(result.status).toBe('active')
  })

  it('advances using the real terminal command keys', () => {
    const result = advanceOnboarding('active', 0, '#')
    expect(result.accepted).toBe(true)
    expect(result.step).toBe(1)
  })

  it('completes on the final hash confirmation', () => {
    const result = advanceOnboarding('active', onboardingSteps.length - 1, '#')
    expect(result.status).toBe('complete')
  })

  it('does not restart a skipped tutorial implicitly', () => {
    const result = advanceOnboarding('skipped', 2, '3')
    expect(result.status).toBe('skipped')
    expect(result.accepted).toBe(false)
  })
})


it('orders every commissioning check before the final readiness confirmation', () => {
  expect(onboardingSteps.map((step) => step.id)).toEqual([
    'startup', 'mining', 'vessels', 'docking', 'power', 'processing', 'communications',
    'support', 'crew', 'autopilot', 'repeat', 'back', 'ready',
  ])
  const state = createInitialState(1000)
  state.onboardingStatus = 'active'
  expect(onboardingPrompt(state)).toContain('17 September 2075')
  for (const step of onboardingSteps) {
    const result = advanceOnboarding(state.onboardingStatus, state.onboardingStep, step.expectedKey)
    expect(result.accepted).toBe(true)
    state.onboardingStatus = result.status
    state.onboardingStep = result.step
  }
  expect(state.onboardingStatus).toBe('complete')
})
